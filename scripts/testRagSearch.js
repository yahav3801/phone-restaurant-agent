const mongoose = require('mongoose');
const ragSearch = require('../src/services/ragSearch');
const Restaurant = require('../src/models/Restaurant');
require('dotenv').config();

async function testSearch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get restaurant
    const restaurant = await Restaurant.findOne({ name: 'הבוקרים' });
    if (!restaurant) {
      console.log('❌ Restaurant not found');
      return;
    }

    // Test different search queries
    const queries = [
      'המבורגר',
      'המבורגרים',
      'burger',
      'hamburger'
    ];

    for (const query of queries) {
      console.log('─'.repeat(60));
      console.log(`🔍 Searching for: "${query}"`);
      console.log('─'.repeat(60));

      const results = await ragSearch.searchMenu(query, restaurant._id, { topK: 5 });

      if (results.length === 0) {
        console.log('❌ NO RESULTS FOUND!\n');
      } else {
        console.log(`✅ Found ${results.length} result(s):\n`);
        results.forEach((r, i) => {
          console.log(`${i + 1}. ${r.name}`);
          console.log(`   Price: ${r.price} ₪`);
          console.log(`   Relevance: ${(r.relevanceScore * 100).toFixed(1)}%`);
          console.log('');
        });
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testSearch();
