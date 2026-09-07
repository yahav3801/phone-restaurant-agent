/**
 * Workflow Service for VAPI
 *
 * Creates and manages VAPI workflows programmatically with Cartesia Sonic 3 voice.
 * Each restaurant gets its own workflow configured with Hebrew voice and tools.
 */

const { VapiClient } = require('@vapi-ai/server-sdk');
const axios = require('axios');
const { getWorkflowTemplate, injectRestaurantContext } = require('../utils/workflowTemplate');
const { registerTools, updateNodesWithToolIds } = require('../utils/toolRegistry');
const logger = require('../utils/logger');

class WorkflowService {
  /**
   * Create a workflow for a restaurant using their VAPI account
   *
   * @param {Object} restaurant - Restaurant document from MongoDB
   * @param {string} baseUrl - Base URL for webhook endpoints (from process.env.BASE_URL)
   * @returns {Promise<Object>} { workflowId, toolIds }
   */
  async createRestaurantWorkflow(restaurant, baseUrl = process.env.BASE_URL) {
    try {
      logger.info('Creating workflow for restaurant', {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name
      });

      // Validate restaurant has VAPI credentials
      if (!restaurant.vapi || !restaurant.vapi.apiKey) {
        throw new Error(`Restaurant ${restaurant._id} missing VAPI API key`);
      }

      // Initialize VAPI client with restaurant's API key
      const vapiClient = new VapiClient({ token: restaurant.vapi.apiKey });

      // Step 1: Get base workflow template
      logger.debug('Generating workflow template');
      const workflowTemplate = getWorkflowTemplate(restaurant);

      // Step 2: Register tools and get toolIds
      logger.info('Registering tools with VAPI');
      const toolIdMap = await registerTools(vapiClient, restaurant, baseUrl);

      // Step 3: Update workflow nodes with toolIds
      logger.debug('Updating nodes with toolIds');
      workflowTemplate.nodes = updateNodesWithToolIds(workflowTemplate.nodes, toolIdMap);

      // Step 4: Inject restaurant-specific context into prompts
      logger.debug('Injecting restaurant context into prompts');
      workflowTemplate.nodes = workflowTemplate.nodes.map(node => {
        if (node.prompt) {
          node.prompt = injectRestaurantContext(node.prompt, restaurant);
        }
        if (node.messagePlan && node.messagePlan.firstMessage) {
          node.messagePlan.firstMessage = injectRestaurantContext(
            node.messagePlan.firstMessage,
            restaurant
          );
        }
        return node;
      });

      // Step 5: Create workflow via VAPI HTTP API (SDK doesn't support workflows yet)
      logger.info('Creating workflow via VAPI HTTP API', {
        workflowName: workflowTemplate.name,
        nodeCount: workflowTemplate.nodes.length,
        edgeCount: workflowTemplate.edges.length
      });

      const response = await axios.post(
        'https://api.vapi.ai/workflow',
        workflowTemplate,
        {
          headers: {
            'Authorization': `Bearer ${restaurant.vapi.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const createdWorkflow = response.data;

      logger.info('✅ Workflow created successfully', {
        restaurantId: restaurant._id,
        workflowId: createdWorkflow.id,
        workflowName: createdWorkflow.name
      });

      return {
        workflowId: createdWorkflow.id,
        workflowName: createdWorkflow.name,
        toolIds: toolIdMap,
        nodeCount: workflowTemplate.nodes.length
      };

    } catch (error) {
      logger.error('❌ Failed to create workflow', {
        restaurantId: restaurant._id,
        error: error.message,
        stack: error.stack
      });

      throw new Error(`Workflow creation failed: ${error.message}`);
    }
  }

  /**
   * Update an existing workflow for a restaurant
   *
   * @param {Object} restaurant - Restaurant document with workflowId
   * @param {string} baseUrl - Base URL for webhook endpoints
   * @returns {Promise<Object>} Updated workflow info
   */
  async updateRestaurantWorkflow(restaurant, baseUrl = process.env.BASE_URL) {
    try {
      if (!restaurant.vapi || !restaurant.vapi.workflowId) {
        throw new Error(`Restaurant ${restaurant._id} has no workflow to update`);
      }

      logger.info('Updating workflow for restaurant', {
        restaurantId: restaurant._id,
        workflowId: restaurant.vapi.workflowId
      });

      const vapiClient = new VapiClient({ token: restaurant.vapi.apiKey });

      // Get updated workflow template
      const workflowTemplate = getWorkflowTemplate(restaurant);

      // Register tools (will update existing or create new)
      const toolIdMap = await registerTools(vapiClient, restaurant, baseUrl);

      // Update nodes with toolIds
      workflowTemplate.nodes = updateNodesWithToolIds(workflowTemplate.nodes, toolIdMap);

      // Inject restaurant context
      workflowTemplate.nodes = workflowTemplate.nodes.map(node => {
        if (node.prompt) {
          node.prompt = injectRestaurantContext(node.prompt, restaurant);
        }
        if (node.messagePlan && node.messagePlan.firstMessage) {
          node.messagePlan.firstMessage = injectRestaurantContext(
            node.messagePlan.firstMessage,
            restaurant
          );
        }
        return node;
      });

      // Update workflow via VAPI API
      const updatedWorkflow = await vapiClient.workflows.update(
        restaurant.vapi.workflowId,
        workflowTemplate
      );

      logger.info('✅ Workflow updated successfully', {
        restaurantId: restaurant._id,
        workflowId: updatedWorkflow.id
      });

      return {
        workflowId: updatedWorkflow.id,
        workflowName: updatedWorkflow.name,
        toolIds: toolIdMap
      };

    } catch (error) {
      logger.error('❌ Failed to update workflow', {
        restaurantId: restaurant._id,
        workflowId: restaurant.vapi?.workflowId,
        error: error.message
      });

      throw new Error(`Workflow update failed: ${error.message}`);
    }
  }

  /**
   * Delete a workflow for a restaurant
   *
   * @param {Object} restaurant - Restaurant document
   * @returns {Promise<boolean>} Success status
   */
  async deleteRestaurantWorkflow(restaurant) {
    try {
      if (!restaurant.vapi || !restaurant.vapi.workflowId) {
        logger.warn('No workflow to delete', { restaurantId: restaurant._id });
        return false;
      }

      logger.info('Deleting workflow', {
        restaurantId: restaurant._id,
        workflowId: restaurant.vapi.workflowId
      });

      const vapiClient = new VapiClient({ token: restaurant.vapi.apiKey });

      await vapiClient.workflows.delete(restaurant.vapi.workflowId);

      logger.info('✅ Workflow deleted successfully', {
        restaurantId: restaurant._id,
        workflowId: restaurant.vapi.workflowId
      });

      return true;

    } catch (error) {
      logger.error('❌ Failed to delete workflow', {
        restaurantId: restaurant._id,
        error: error.message
      });

      throw new Error(`Workflow deletion failed: ${error.message}`);
    }
  }

  /**
   * Get workflow details from VAPI
   *
   * @param {Object} restaurant - Restaurant document
   * @returns {Promise<Object>} Workflow details
   */
  async getWorkflow(restaurant) {
    try {
      if (!restaurant.vapi || !restaurant.vapi.workflowId) {
        throw new Error(`Restaurant ${restaurant._id} has no workflow`);
      }

      const vapiClient = new VapiClient({ token: restaurant.vapi.apiKey });

      const workflow = await vapiClient.workflows.get(restaurant.vapi.workflowId);

      logger.debug('Retrieved workflow details', {
        restaurantId: restaurant._id,
        workflowId: workflow.id,
        nodeCount: workflow.nodes?.length || 0
      });

      return workflow;

    } catch (error) {
      logger.error('Failed to get workflow', {
        restaurantId: restaurant._id,
        error: error.message
      });

      throw new Error(`Get workflow failed: ${error.message}`);
    }
  }

  /**
   * List all workflows for a restaurant's VAPI account
   *
   * @param {Object} restaurant - Restaurant document
   * @returns {Promise<Array>} List of workflows
   */
  async listWorkflows(restaurant) {
    try {
      if (!restaurant.vapi || !restaurant.vapi.apiKey) {
        throw new Error(`Restaurant ${restaurant._id} missing VAPI API key`);
      }

      const vapiClient = new VapiClient({ token: restaurant.vapi.apiKey });

      const workflows = await vapiClient.workflows.list();

      logger.debug('Listed workflows', {
        restaurantId: restaurant._id,
        count: workflows.length
      });

      return workflows;

    } catch (error) {
      logger.error('Failed to list workflows', {
        restaurantId: restaurant._id,
        error: error.message
      });

      throw new Error(`List workflows failed: ${error.message}`);
    }
  }
}

module.exports = new WorkflowService();
