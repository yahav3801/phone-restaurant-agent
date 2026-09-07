require('dotenv').config();
const mongoose = require('mongoose');
const MenuItem = require('../src/models/MenuItem');
const KnowledgeBase = require('../src/models/KnowledgeBase');
const connectDB = require('../src/db/mongodb');
const logger = require('../src/utils/logger');

/**
 * Migrate MenuItem collection to knowledge_base collection
 * Converts MenuItem documents to knowledge_base with type='menu'
 */
async function migrateToKnowledgeBase() {
  try {
    await connectDB();
    console.log('\n🔄 Starting migration: MenuItem → knowledge_base\n');

    // Fetch all menu items
    const menuItems = await MenuItem.find({}).lean();
    console.log(`📊 Found ${menuItems.length} menu items to migrate`);

    if (menuItems.length === 0) {
      console.log('\n⚠️  No menu items found.');
      console.log('💡 Run these scripts first:');
      console.log('   1. node scripts/seed.js');
      console.log('   2. node scripts/migrateMenuToVector.js\n');
      return;
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errors = [];

    for (const item of menuItems) {
      try {
        // Check if already migrated
        const existing = await KnowledgeBase.findOne({
          restaurantId: item.restaurantId,
          type: 'menu',
          name: item.name
        });

        if (existing) {
          logger.debug(`Skipping duplicate: ${item.name}`);
          skippedCount++;
          continue;
        }

        // Create knowledge_base document
        const knowledgeDoc = new KnowledgeBase({
          type: 'menu',
          restaurantId: item.restaurantId,
          embedding: item.embedding,
          embeddingModel: item.embeddingModel || 'text-embedding-3-small',

          // Menu-specific fields
          name: item.name,
          price: item.price,
          description: item.description || '',
          category: item.category,
          ingredients: [], // TODO: Extract from description if needed
          inStock: item.inStock !== undefined ? item.inStock : true,

          // Timestamps
          createdAt: item.createdAt || new Date(),
          updatedAt: item.updatedAt || new Date()
        });

        await knowledgeDoc.save();
        migratedCount++;

        console.log(`  ✅ ${item.name} (${item.category})`);

        // Rate limiting to avoid overwhelming MongoDB
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        errors.push({ item: item.name, error: error.message });
        logger.error(`Error migrating item ${item.name}:`, {
          error: error.message,
          item: item.name
        });
      }
    }

    console.log(`\n📈 Migration Summary:`);
    console.log(`   Total items: ${menuItems.length}`);
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log(`\n❌ Errors:`);
      errors.forEach(e => console.log(`   - ${e.item}: ${e.error}`));
    }

    // Show sample migrated document
    const sample = await KnowledgeBase.findOne({ type: 'menu' });
    if (sample) {
      console.log(`\n📝 Sample migrated document:`);
      console.log(`   Type: ${sample.type}`);
      console.log(`   Name: ${sample.name}`);
      console.log(`   Category: ${sample.category}`);
      console.log(`   Price: ${sample.price}₪`);
      console.log(`   Has embedding: ${!!sample.embedding}`);
      console.log(`   Embedding length: ${sample.embedding?.length}`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    logger.error('Migration failed:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed\n');
  }
}

// Run migration
migrateToKnowledgeBase()
  .then(() => {
    console.log('✅ Migration completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
