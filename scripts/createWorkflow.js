/**
 * Create Workflow for Restaurant
 *
 * This script creates a VAPI workflow for a restaurant with Cartesia Sonic 3 voice.
 * Run this after migration to generate workflows for each restaurant.
 *
 * Usage:
 *   node scripts/createWorkflow.js
 *   node scripts/createWorkflow.js --restaurant-id <id>
 *   node scripts/createWorkflow.js --restaurant-name "מסעדת הבוקרים"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Restaurant = require('../src/models/Restaurant');
const WorkflowService = require('../src/services/WorkflowService');
const logger = require('../src/utils/logger');

// Parse command line arguments
const args = process.argv.slice(2);
let restaurantId = null;
let restaurantName = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--restaurant-id' && args[i + 1]) {
    restaurantId = args[i + 1];
    i++;
  } else if (args[i] === '--restaurant-name' && args[i + 1]) {
    restaurantName = args[i + 1];
    i++;
  }
}

async function createWorkflow() {
  try {
    console.log('🚀 Starting workflow creation...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find restaurant
    let restaurant;
    if (restaurantId) {
      console.log(`Finding restaurant by ID: ${restaurantId}`);
      restaurant = await Restaurant.findById(restaurantId);
    } else if (restaurantName) {
      console.log(`Finding restaurant by name: ${restaurantName}`);
      restaurant = await Restaurant.findOne({ name: restaurantName });
    } else {
      // No filter - get first restaurant
      console.log('No restaurant specified - using first restaurant in database');
      restaurant = await Restaurant.findOne();
    }

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    console.log(`\n📍 Found restaurant: ${restaurant.name} (${restaurant._id})\n`);

    // Check if restaurant has VAPI credentials
    if (!restaurant.vapi || !restaurant.vapi.apiKey) {
      console.log('❌ Restaurant missing VAPI API key');
      console.log('   Please add VAPI credentials to restaurant or run migration script first.\n');
      process.exit(1);
    }

    // Check if workflow already exists
    if (restaurant.vapi.workflowId) {
      console.log(`⚠️  Restaurant already has workflow: ${restaurant.vapi.workflowId}`);
      console.log('   This will create a NEW workflow. The old one will remain in VAPI.');
      console.log('   You may want to delete the old workflow manually.\n');
    }

    console.log('Creating workflow with Cartesia Sonic 3 voice...');
    console.log(`Voice ID: ${restaurant.workflowConfig?.voiceSettings?.voiceId || '3e32f3c5-9ac0-4192-9994-87fdb277120f'}`);
    console.log(`Language: ${restaurant.workflowConfig?.voiceSettings?.language || 'he'}\n`);

    // Create workflow
    const result = await WorkflowService.createRestaurantWorkflow(
      restaurant,
      process.env.BASE_URL
    );

    console.log('\n' + '='.repeat(60));
    console.log('✅ Workflow created successfully!');
    console.log('='.repeat(60));
    console.log(`Workflow ID: ${result.workflowId}`);
    console.log(`Workflow Name: ${result.workflowName}`);
    console.log(`Nodes: ${result.nodeCount}`);
    console.log(`\nTools registered:`);
    for (const [toolName, toolId] of Object.entries(result.toolIds)) {
      console.log(`  - ${toolName}: ${toolId}`);
    }
    console.log('='.repeat(60));

    // Update restaurant with workflow ID
    restaurant.vapi.workflowId = result.workflowId;
    await restaurant.save();

    console.log('\n✅ Restaurant updated with workflow ID');

    console.log('\n📋 Next steps:');
    console.log('1. Go to VAPI dashboard: https://dashboard.vapi.ai/');
    console.log(`2. Find your phone number (${restaurant.vapiPhoneNumber || 'N/A'})`);
    console.log(`3. Assign workflow: ${result.workflowId}`);
    console.log(`4. Set webhook URL: ${process.env.BASE_URL}/webhooks/vapi`);
    console.log(`5. Set webhook secret: ${restaurant.vapi.webhookSecret?.substring(0, 12)}...`);
    console.log('\n6. Test by calling the phone number!\n');

    await mongoose.connection.close();
    console.log('✅ Complete!\n');

  } catch (error) {
    console.error('\n❌ Workflow creation failed:', error.message);
    console.error('\nError details:', error);

    if (error.response) {
      console.error('\nVAPI API Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }

    process.exit(1);
  }
}

// Run workflow creation
if (require.main === module) {
  createWorkflow()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = createWorkflow;
