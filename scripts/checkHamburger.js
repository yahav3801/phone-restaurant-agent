const mongoose = require('mongoose');
const KnowledgeBase = require('../src/models/KnowledgeBase');
require('dotenv').config();

async function checkHamburger() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Find all hamburger items
    const items = await KnowledgeBase.find({
      type: 'menu',
      name: /המבורגר/i
    }).lean();

    console.log(`\n🍔 Found ${items.length} hamburger item(s):\n`);

    items.forEach(item => {
      console.log('─'.repeat(60));
      console.log(`Name: ${item.name}`);
      console.log(`Price: ${item.price} ₪`);
      console.log(`Description: ${item.description || 'N/A'}`);
      console.log(`Category: ${item.category}`);
      console.log(`In Stock: ${item.inStock}`);
    });

    if (items.length === 0) {
      console.log('❌ No hamburger items found in database!');

      // Show a few sample items instead
      const samples = await KnowledgeBase.find({ type: 'menu' }).limit(5).lean();
      console.log('\n📋 Sample menu items:');
      samples.forEach(s => {
        console.log(`  - ${s.name}: ${s.price} ₪`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkHamburger();
