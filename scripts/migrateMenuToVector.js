require('dotenv').config();
const mongoose = require('mongoose');
const Restaurant = require('../src/models/Restaurant');
const MenuItem = require('../src/models/MenuItem');
const { generateEmbedding } = require('../src/utils/embeddings');
const logger = require('../src/utils/logger');

async function migrateMenuToVector() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    const restaurants = await Restaurant.find();
    console.log(`✓ Found ${restaurants.length} restaurant(s) to migrate`);

    if (restaurants.length === 0) {
      console.log('⚠ No restaurants found. Run seed script first.');
      process.exit(0);
    }

    let totalItemsMigrated = 0;

    for (const restaurant of restaurants) {
      console.log(`\n📍 Migrating menu for: ${restaurant.name}`);
      console.log(`   Restaurant ID: ${restaurant._id}`);
      console.log(`   Menu items to migrate: ${restaurant.menu?.length || 0}`);

      if (!restaurant.menu || restaurant.menu.length === 0) {
        console.log('   ⚠ No menu items found, skipping...');
        continue;
      }

      // Check if already migrated
      const existingCount = await MenuItem.countDocuments({
        restaurantId: restaurant._id
      });

      if (existingCount > 0) {
        console.log(`   ⚠ ${existingCount} MenuItem(s) already exist`);
        const answer = await askQuestion('   Overwrite existing items? (yes/no): ');

        if (answer.toLowerCase() !== 'yes') {
          console.log('   Skipping this restaurant...');
          continue;
        }

        await MenuItem.deleteMany({ restaurantId: restaurant._id });
        console.log(`   ✓ Deleted ${existingCount} existing items`);
      }

      // Migrate each menu item
      for (let i = 0; i < restaurant.menu.length; i++) {
        const menuItem = restaurant.menu[i];

        try {
          console.log(`   [${i + 1}/${restaurant.menu.length}] Processing: ${menuItem.name}`);

          // Combine name and description for richer embedding
          const textForEmbedding = `${menuItem.name} ${menuItem.description || ''}`.trim();
          const embedding = await generateEmbedding(textForEmbedding);

          // Create MenuItem document
          await MenuItem.create({
            restaurantId: restaurant._id,
            name: menuItem.name,
            description: menuItem.description || '',
            price: menuItem.price,
            category: menuItem.category,
            inStock: menuItem.inStock !== false,
            embedding: embedding,
            embeddingModel: 'text-embedding-3-small'
          });

          totalItemsMigrated++;
          console.log(`   ✓ Created MenuItem: ${menuItem.name}`);

          // Small delay to avoid rate limiting (OpenAI: 3000 RPM tier 1)
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (itemError) {
          console.error(`   ✗ Failed to migrate "${menuItem.name}":`, itemError.message);
        }
      }

      console.log(`   ✅ Completed migration for ${restaurant.name}`);
    }

    console.log(`\n✅ Migration complete! Total items migrated: ${totalItemsMigrated}`);
    console.log(`\n⚠ NEXT STEPS:`);
    console.log(`   1. Verify MenuItems collection in MongoDB`);
    console.log(`   2. Test search_menu endpoint (after PHASE 5)`);
    console.log(`   3. Update Vapi system prompts (PHASE 6)`);

  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

function askQuestion(query) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

console.log('='.repeat(60));
console.log('Menu to Vector Migration Script');
console.log('='.repeat(60));

migrateMenuToVector().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
