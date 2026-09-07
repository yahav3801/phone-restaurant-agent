/**
 * Migration Script: Migrate to Multi-Account VAPI Architecture
 *
 * This script populates existing restaurants with VAPI configuration fields.
 * It uses the global VAPI_API_KEY as a temporary measure until each restaurant
 * gets their own VAPI account.
 *
 * Run this once after adding the vapi fields to the Restaurant schema.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Restaurant = require('../src/models/Restaurant');

async function migrateToMultiAccount() {
  try {
    console.log('Starting migration to multi-account VAPI architecture...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all restaurants
    const restaurants = await Restaurant.find({});
    console.log(`\nFound ${restaurants.length} restaurant(s) to migrate\n`);

    if (restaurants.length === 0) {
      console.log('⚠️  No restaurants found in database. Nothing to migrate.');
      await mongoose.connection.close();
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;

    for (const restaurant of restaurants) {
      // Check if restaurant already has vapi configuration
      if (restaurant.vapi && restaurant.vapi.apiKey) {
        console.log(`⏭️  Skipping "${restaurant.name}" - already has VAPI configuration`);
        skippedCount++;
        continue;
      }

      // Generate unique webhook secret for this restaurant
      const webhookSecret = crypto.randomBytes(32).toString('hex');

      // Populate VAPI configuration with global key (temporary)
      restaurant.vapi = {
        apiKey: process.env.VAPI_API_KEY || '',
        workflowId: null,  // Will be populated when workflow is created
        phoneNumberId: process.env.PHONE_NUMBER_ID || null,
        webhookSecret: webhookSecret
      };

      // Initialize workflow config with defaults (from schema)
      if (!restaurant.workflowConfig) {
        restaurant.workflowConfig = {
          firstMessage: restaurant.firstMessage || 'שלום! איך אוכל לעזור לך היום?',
          voiceSettings: {
            provider: 'cartesia',
            model: 'sonic-3',
            voiceId: '3e32f3c5-9ac0-4192-9994-87fdb277120f',
            language: 'he'
          },
          customNodes: {}
        };
      }

      await restaurant.save();

      console.log(`✅ Migrated "${restaurant.name}"`);
      console.log(`   - VAPI API Key: ${restaurant.vapi.apiKey ? '***' + restaurant.vapi.apiKey.slice(-8) : 'NOT SET'}`);
      console.log(`   - Phone Number ID: ${restaurant.vapi.phoneNumberId || 'NOT SET'}`);
      console.log(`   - Webhook Secret: ${webhookSecret.slice(0, 12)}...`);
      console.log(`   - Voice: ${restaurant.workflowConfig.voiceSettings.provider} ${restaurant.workflowConfig.voiceSettings.model}\n`);

      migratedCount++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Migrated: ${migratedCount} restaurant(s)`);
    console.log(`⏭️  Skipped: ${skippedCount} restaurant(s) (already configured)`);
    console.log(`📊 Total: ${restaurants.length} restaurant(s)`);
    console.log('='.repeat(60));

    if (migratedCount > 0) {
      console.log('\n⚠️  IMPORTANT NOTES:');
      console.log('1. Restaurants are using the global VAPI_API_KEY as a temporary measure');
      console.log('2. Each restaurant should get their own VAPI account for production');
      console.log('3. Run the workflow creation script next to generate workflows');
      console.log('4. Webhook secrets have been generated - update VAPI dashboard if needed\n');
    }

    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateToMultiAccount()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = migrateToMultiAccount;
