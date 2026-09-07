require('dotenv').config();
const mongoose = require('mongoose');
const MenuItem = require('../src/models/MenuItem');
const { generateEmbedding, dotProduct } = require('../src/utils/embeddings');

const testQueries = [
  { query: 'בשר', expectedCategories: ['מנות בשר', 'המבורגרים'], avoid: ['משקאות', 'תוספות'] },
  { query: 'המבורגר', expectedCategories: ['המבורגרים'], avoid: ['מנות בשר', 'משקאות'] },
  { query: 'תוספת', expectedCategories: ['תוספות'], avoid: ['מנות בשר', 'משקאות'] },
  { query: 'סלט', expectedCategories: ['סלטים'], avoid: ['מנות בשר', 'משקאות'] },
  { query: 'משקה', expectedCategories: ['משקאות'], avoid: ['מנות בשר', 'תוספות'] },
  { query: 'קינוח', expectedCategories: ['קינוחים'], avoid: ['מנות בשר', 'משקאות'] },
  { query: 'עוף', expectedCategories: ['מנות עוף'], avoid: ['מנות בשר', 'משקאות'] },
  { query: 'אנטריקוט', expectedItems: ['אנטריקוט 300 גרם', 'אנטריקוט 400 גרם'] },
  { query: 'קולה', expectedItems: ['קולה', 'קולה זירו'] }
];

async function testVectorSearch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const restaurantId = '692b23ace32a5f99dd0bbc2f';
    const items = await MenuItem.find({ restaurantId }).lean();
    console.log(`✓ Loaded ${items.length} menu items\n`);

    let passedTests = 0;
    let failedTests = 0;

    for (const test of testQueries) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🔍 Testing query: "${test.query}"`);
      console.log(`${'='.repeat(70)}`);

      // Generate query embedding
      const queryEmbedding = await generateEmbedding(test.query);

      // Calculate similarities
      const scored = items.map(item => ({
        name: item.name,
        category: item.category,
        score: dotProduct(item.embedding, queryEmbedding)
      }));

      // Sort by score
      const topResults = scored.sort((a, b) => b.score - a.score).slice(0, 5);

      // Display results
      console.log('\nTop 5 Results:');
      topResults.forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.name.padEnd(30)} (${result.category.padEnd(15)}) Score: ${result.score.toFixed(4)}`);
      });

      // Validate results
      let testPassed = true;
      const reasons = [];

      if (test.expectedCategories) {
        const topCategories = topResults.map(r => r.category);
        const hasExpected = test.expectedCategories.some(cat => topCategories.includes(cat));
        if (!hasExpected) {
          testPassed = false;
          reasons.push(`❌ Expected categories ${test.expectedCategories.join(' or ')} not in top 5`);
        } else {
          reasons.push(`✓ Found expected category in top 5`);
        }

        if (test.avoid) {
          const hasAvoided = test.avoid.some(cat => topCategories[0] === cat);
          if (hasAvoided) {
            testPassed = false;
            reasons.push(`❌ Top result is from avoided category: ${topCategories[0]}`);
          } else {
            reasons.push(`✓ Avoided unwanted categories in #1 spot`);
          }
        }
      }

      if (test.expectedItems) {
        const topNames = topResults.map(r => r.name);
        const found = test.expectedItems.filter(item => topNames.includes(item));
        if (found.length === 0) {
          testPassed = false;
          reasons.push(`❌ Expected items ${test.expectedItems.join(', ')} not in top 5`);
        } else {
          reasons.push(`✓ Found ${found.length}/${test.expectedItems.length} expected items`);
        }
      }

      // Print validation
      console.log('\nValidation:');
      reasons.forEach(r => console.log(`  ${r}`));

      if (testPassed) {
        console.log('\n✅ TEST PASSED');
        passedTests++;
      } else {
        console.log('\n❌ TEST FAILED');
        failedTests++;
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n\n${'='.repeat(70)}`);
    console.log('📊 FINAL RESULTS');
    console.log(`${'='.repeat(70)}`);
    console.log(`✅ Passed: ${passedTests}/${testQueries.length}`);
    console.log(`❌ Failed: ${failedTests}/${testQueries.length}`);
    console.log(`📈 Success Rate: ${((passedTests / testQueries.length) * 100).toFixed(1)}%`);

    if (failedTests === 0) {
      console.log('\n🎉 All tests passed! Vector search is working correctly.');
    } else {
      console.log('\n⚠ Some tests failed. Consider enriching descriptions further.');
    }

  } catch (error) {
    console.error('✗ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

console.log('='.repeat(70));
console.log('Vector Search Quality Test');
console.log('='.repeat(70));

testVectorSearch();
