const mongoose = require('mongoose');
const KnowledgeBase = require('../src/models/KnowledgeBase');
require('dotenv').config();

async function checkBeer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const item = await KnowledgeBase.findOne({
      type: 'menu',
      name: /בירה/i
    }).lean();

    if (!item) {
      console.log('❌ Beer not found in database!');
      return;
    }

    console.log('\n🍺 Beer Item:');
    console.log('─'.repeat(60));
    console.log('Name:', item.name);
    console.log('Price:', item.price, '₪');
    console.log('Description:', item.description || 'N/A');
    console.log('Category:', item.category);
    console.log('In Stock:', item.inStock);
    console.log('Has embedding:', !!item.embedding);
    console.log('Embedding length:', item.embedding?.length || 0);
    console.log('─'.repeat(60));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkBeer();
