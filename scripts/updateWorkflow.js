/**
 * Update existing VAPI workflow with new tools
 * 
 * Usage: node scripts/updateWorkflow.js <restaurantId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const WorkflowService = require('../src/services/WorkflowService');
const Restaurant = require('../src/models/Restaurant');

async function updateWorkflow() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get restaurant ID from command line
    const restaurantId = process.argv[2];
    if (!restaurantId) {
      console.error('❌ Error: Restaurant ID required');
      console.error('Usage: node scripts/updateWorkflow.js <restaurantId>\n');
      process.exit(1);
    }

    // Find restaurant
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      console.error(`❌ Restaurant not found: ${restaurantId}\n`);
      process.exit(1);
    }

    console.log(`📋 Restaurant: ${restaurant.name}`);
    console.log(`   ID: ${restaurant._id}`);
    
    if (!restaurant.vapi?.workflowId) {
      console.error('❌ Restaurant has no workflow ID. Use createWorkflow.js to create one first.\n');
      process.exit(1);
    }

    console.log(`   Current Workflow ID: ${restaurant.vapi.workflowId}\n`);
    console.log('🔄 Updating workflow with new tools...\n');

    // Update workflow
    const result = await WorkflowService.updateRestaurantWorkflow(
      restaurant,
      process.env.BASE_URL
    );

    console.log('\n' + '='.repeat(60));
    console.log('✅ Workflow updated successfully!');
    console.log('='.repeat(60));
    console.log(`Workflow ID: ${result.workflowId}`);
    console.log(`Workflow Name: ${result.workflowName}`);
    console.log(`\nTools registered:`);
    for (const [toolName, toolId] of Object.entries(result.toolIds)) {
      console.log(`  ✅ ${toolName}: ${toolId}`);
    }
    console.log('='.repeat(60) + '\n');

    await mongoose.connection.close();
    console.log('✅ Complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error updating workflow:', error.message);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

updateWorkflow();

