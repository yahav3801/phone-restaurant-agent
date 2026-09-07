require('dotenv').config();
const mongoose = require('mongoose');
const MenuItem = require('../src/models/MenuItem');
const { generateEmbedding } = require('../src/utils/embeddings');

async function fixDescriptions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const restaurantId = '692b23ace32a5f99dd0bbc2f';

    // Fix problematic descriptions that contain cross-category keywords
    const fixes = {
      'אורז': 'אורז לבן מבושל, גרגירים נפרדים ואוורירי',
      'פירה': 'פירה תפוחי אדמה חלקה וקרמית',
      'בטטה': 'בטטה מטוגנת פריכה מבחוץ ורכה מבפנים',
      'צ\'יפס': 'צ\'יפס תפוחי אדמה פריך וזהוב'
    };

    console.log('Fixing problematic menu descriptions...\n');

    for (const [itemName, newDescription] of Object.entries(fixes)) {
      const item = await MenuItem.findOne({
        name: itemName,
        restaurantId
      });

      if (item) {
        console.log(`Updating: ${itemName}`);
        console.log(`  Old: ${item.description}`);
        console.log(`  New: ${newDescription}`);

        // Generate new embedding
        const textForEmbedding = `${itemName} ${newDescription}`;
        const newEmbedding = await generateEmbedding(textForEmbedding);

        // Update item
        item.description = newDescription;
        item.embedding = newEmbedding;
        await item.save();

        console.log(`  ✓ Updated\n`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.log(`⚠ Item not found: ${itemName}\n`);
      }
    }

    console.log('\n✅ All descriptions fixed!');
    console.log('\nRun the vector search test to verify:');
    console.log('  node scripts/testVectorSearch.js');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

fixDescriptions();
