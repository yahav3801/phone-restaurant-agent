/**
 * Restaurant Onboarding Script
 *
 * Automates the process of onboarding a new restaurant:
 * 1. Creates restaurant in database
 * 2. Generates webhook secret
 * 3. Creates VAPI workflow with Sonic 3 voice
 * 4. Registers tools
 * 5. Returns configuration instructions
 *
 * Usage:
 *   node scripts/onboardRestaurant.js \\
 *     --name "Restaurant Name" \\
 *     --vapi-key "sk_xxxxx" \\
 *     --phone "+972501234567" \\
 *     --meshulam-key "xxxxx" \\
 *     --meshulam-terminal "12345"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Restaurant = require('../src/models/Restaurant');
const WorkflowService = require('../src/services/WorkflowService');
const logger = require('../src/utils/logger');

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  name: null,
  vapiKey: null,
  phone: null,
  meshulamKey: null,
  meshulamTerminal: null,
  address: '',
  humanPhone: null
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && args[i + 1]) {
    config.name = args[i + 1];
    i++;
  } else if (args[i] === '--vapi-key' && args[i + 1]) {
    config.vapiKey = args[i + 1];
    i++;
  } else if (args[i] === '--phone' && args[i + 1]) {
    config.phone = args[i + 1];
    i++;
  } else if (args[i] === '--meshulam-key' && args[i + 1]) {
    config.meshulamKey = args[i + 1];
    i++;
  } else if (args[i] === '--meshulam-terminal' && args[i + 1]) {
    config.meshulamTerminal = args[i + 1];
    i++;
  } else if (args[i] === '--address' && args[i + 1]) {
    config.address = args[i + 1];
    i++;
  } else if (args[i] === '--human-phone' && args[i + 1]) {
    config.humanPhone = args[i + 1];
    i++;
  }
}

// Validate required fields
function validateConfig() {
  const required = ['name', 'vapiKey', 'phone', 'meshulamKey', 'meshulamTerminal'];
  const missing = required.filter(field => !config[field]);

  if (missing.length > 0) {
    console.error('❌ Missing required arguments:', missing.join(', '));
    console.log('\nUsage:');
    console.log('  node scripts/onboardRestaurant.js \\\\');
    console.log('    --name "Restaurant Name" \\\\');
    console.log('    --vapi-key "sk_xxxxx" \\\\');
    console.log('    --phone "+972501234567" \\\\');
    console.log('    --meshulam-key "xxxxx" \\\\');
    console.log('    --meshulam-terminal "12345" \\\\');
    console.log('    [--address "123 Main St"] \\\\');
    console.log('    [--human-phone "+972501111111"]\n');
    process.exit(1);
  }
}

async function onboardRestaurant() {
  try {
    console.log('🍽️  Restaurant Onboarding\n');
    console.log('='.repeat(60));

    // Validate configuration
    validateConfig();

    // Connect to MongoDB
    console.log('\n📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if restaurant already exists
    const existing = await Restaurant.findOne({
      $or: [
        { name: config.name },
        { phoneNumber: config.phone },
        { vapiPhoneNumber: config.phone }
      ]
    });

    if (existing) {
      console.log('\n⚠️  Restaurant already exists:');
      console.log(`   Name: ${existing.name}`);
      console.log(`   ID: ${existing._id}`);
      console.log('\nAborting to prevent duplicates.\n');
      process.exit(1);
    }

    // Generate webhook secret
    console.log('\n🔐 Generating webhook secret...');
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Create restaurant document
    console.log('📝 Creating restaurant document...');
    const restaurant = new Restaurant({
      name: config.name,
      phoneNumber: config.phone,
      vapiPhoneNumber: config.phone,
      meshulamApiKey: config.meshulamKey,
      meshulamTerminalNumber: config.meshulamTerminal,
      address: config.address || '',
      humanRedirectPhone: config.humanPhone || config.phone,
      vapi: {
        apiKey: config.vapiKey,
        workflowId: null,  // Will be populated after workflow creation
        phoneNumberId: null,
        webhookSecret: webhookSecret
      },
      workflowConfig: {
        firstMessage: 'שלום! איך אוכל לעזור לך היום?',
        voiceSettings: {
          provider: 'cartesia',
          model: 'sonic-3',
          voiceId: '3e32f3c5-9ac0-4192-9994-87fdb277120f',
          language: 'he'
        },
        customNodes: {}
      },
      settings: {
        allowDelivery: true,
        allowPickup: true,
        deliveryFee: 15,
        minimumOrder: 50
      }
    });

    await restaurant.save();
    console.log(`✅ Restaurant created: ${restaurant._id}`);

    // Create workflow
    console.log('\n🎭 Creating VAPI workflow with Sonic 3 voice...');
    const workflowResult = await WorkflowService.createRestaurantWorkflow(
      restaurant,
      process.env.BASE_URL
    );

    console.log(`✅ Workflow created: ${workflowResult.workflowId}`);
    console.log(`   Name: ${workflowResult.workflowName}`);
    console.log(`   Nodes: ${workflowResult.nodeCount}`);

    // Update restaurant with workflow ID
    restaurant.vapi.workflowId = workflowResult.workflowId;
    await restaurant.save();

    console.log('\n' + '='.repeat(60));
    console.log('✅ ONBOARDING COMPLETE!');
    console.log('='.repeat(60));

    console.log('\n📊 Restaurant Information:');
    console.log(`   Name: ${restaurant.name}`);
    console.log(`   ID: ${restaurant._id}`);
    console.log(`   Phone: ${restaurant.phoneNumber}`);
    console.log(`   Address: ${restaurant.address || 'Not set'}`);

    console.log('\n🔐 VAPI Configuration:');
    console.log(`   API Key: ${config.vapiKey.substring(0, 12)}...`);
    console.log(`   Workflow ID: ${workflowResult.workflowId}`);
    console.log(`   Webhook Secret: ${webhookSecret.substring(0, 16)}...`);

    console.log('\n🎤 Voice Configuration:');
    console.log(`   Provider: ${restaurant.workflowConfig.voiceSettings.provider}`);
    console.log(`   Model: ${restaurant.workflowConfig.voiceSettings.model}`);
    console.log(`   Voice ID: ${restaurant.workflowConfig.voiceSettings.voiceId}`);
    console.log(`   Language: ${restaurant.workflowConfig.voiceSettings.language}`);

    console.log('\n🔧 Tools Registered:');
    for (const [toolName, toolId] of Object.entries(workflowResult.toolIds)) {
      console.log(`   - ${toolName}: ${toolId}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 NEXT STEPS FOR RESTAURANT OWNER');
    console.log('='.repeat(60));

    console.log('\n1. Go to VAPI Dashboard:');
    console.log('   https://dashboard.vapi.ai/');

    console.log('\n2. Login with the VAPI account credentials');

    console.log('\n3. Configure Phone Number:');
    console.log(`   - Find phone number: ${config.phone}`);
    console.log(`   - Assign workflow: ${workflowResult.workflowId}`);

    console.log('\n4. Configure Webhook:');
    console.log(`   - Webhook URL: ${process.env.BASE_URL}/webhooks/vapi`);
    console.log(`   - Webhook Secret: ${webhookSecret}`);

    console.log('\n5. Test the System:');
    console.log(`   - Call ${config.phone}`);
    console.log('   - Verify Sonic 3 Hebrew voice works');
    console.log('   - Test menu search, order placement');

    console.log('\n6. Add Menu Items:');
    console.log('   - Use the menu management API or admin panel');
    console.log('   - Ensure embeddings are generated for vector search\n');

    console.log('='.repeat(60));
    console.log('🎉 Restaurant onboarding complete!\n');

    await mongoose.connection.close();

  } catch (error) {
    console.error('\n❌ Onboarding failed:', error.message);
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

// Run onboarding
if (require.main === module) {
  onboardRestaurant()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = onboardRestaurant;
