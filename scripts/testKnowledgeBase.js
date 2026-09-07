require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/db/mongodb');
const ragSearch = require('../src/services/ragSearch');
const Restaurant = require('../src/models/Restaurant');
const logger = require('../src/utils/logger');

/**
 * Test queries for knowledge base
 */
const testQueries = [
  // Menu queries
  {
    query: 'אני רוצה משהו עם ביצים לארוחת בוקר',
    expectedType: 'menu',
    category: 'breakfast',
    description: 'Menu query for breakfast items'
  },
  {
    query: 'מה יש לשתות?',
    expectedType: 'menu',
    category: 'drinks',
    description: 'Menu query for drinks'
  },
  {
    query: 'יש סלטים?',
    expectedType: 'menu',
    category: 'salads',
    description: 'Menu query for salads'
  },

  // Info queries
  {
    query: 'מה שעות הפעילות שלכם?',
    expectedType: 'info',
    category: 'hours',
    description: 'Restaurant hours question'
  },
  {
    query: 'אתם כשרים?',
    expectedType: 'info',
    category: 'kosher',
    description: 'Kosher certification question'
  },
  {
    query: 'עושים משלוחים?',
    expectedType: 'info',
    category: 'delivery',
    description: 'Delivery service question'
  },
  {
    query: 'איך אפשר לשלם?',
    expectedType: 'info',
    category: 'payment',
    description: 'Payment methods question'
  },

  // Mixed queries (could match both menu and info)
  {
    query: 'אני רוצה להזמין משהו טבעוני',
    expectedType: 'both',
    categories: ['menu', 'info'],
    description: 'Vegan query (menu + info)'
  }
];

async function testKnowledgeBase() {
  try {
    await connectDB();
    console.log('\n🔍 Testing Knowledge Base Search\n');
    console.log('═'.repeat(70) + '\n');

    const restaurant = await Restaurant.findOne();
    if (!restaurant) {
      throw new Error('No restaurant found. Run seed.js first.');
    }

    console.log(`🏪 Restaurant: ${restaurant.name}\n`);

    let passed = 0;
    let failed = 0;
    const results = [];

    for (let i = 0; i < testQueries.length; i++) {
      const test = testQueries[i];

      console.log(`Test ${i + 1}/${testQueries.length}: ${test.description}`);
      console.log(`Query: "${test.query}"`);
      console.log(`Expected: ${test.expectedType}`);

      try {
        const searchResults = await ragSearch.search(test.query, restaurant._id, {
          topK: 3
        });

        console.log(`Results: ${searchResults.length} items found`);

        if (searchResults.length > 0) {
          searchResults.forEach((result, idx) => {
            const displayName = result.type === 'menu'
              ? `${result.name} (${result.category}, ${result.price}₪)`
              : `${result.question.substring(0, 40)}... (${result.category})`;

            console.log(`  ${idx + 1}. [${result.type}] ${displayName}`);
            console.log(`     Score: ${result.relevanceScore.toFixed(3)}`);
          });
        }

        // Validate results
        let testPassed = false;

        if (searchResults.length === 0) {
          console.log('❌ FAIL: No results');
          failed++;
        } else if (test.expectedType === 'both') {
          const hasMenu = searchResults.some(r => r.type === 'menu');
          const hasInfo = searchResults.some(r => r.type === 'info');
          if (hasMenu || hasInfo) {
            console.log('✅ PASS: Found relevant results');
            passed++;
            testPassed = true;
          } else {
            console.log('❌ FAIL: Expected both types or at least one');
            failed++;
          }
        } else {
          const topResult = searchResults[0];
          if (topResult.type === test.expectedType) {
            console.log('✅ PASS: Correct type returned');
            passed++;
            testPassed = true;
          } else {
            console.log(`❌ FAIL: Got ${topResult.type}, expected ${test.expectedType}`);
            failed++;
          }
        }

        results.push({
          query: test.query,
          passed: testPassed,
          resultCount: searchResults.length,
          topType: searchResults[0]?.type,
          topScore: searchResults[0]?.relevanceScore
        });

      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        failed++;
        results.push({
          query: test.query,
          passed: false,
          error: error.message
        });
      }

      console.log('─'.repeat(70) + '\n');
    }

    // Summary
    console.log('═'.repeat(70));
    console.log('\n📊 Test Results Summary\n');
    console.log(`   Total tests: ${testQueries.length}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);

    const successRate = ((passed / testQueries.length) * 100).toFixed(1);
    console.log(`   📈 Success Rate: ${successRate}%`);

    if (successRate >= 80) {
      console.log(`\n   🎉 Excellent! Success rate is above 80%`);
    } else if (successRate >= 60) {
      console.log(`\n   ⚠️  Success rate is acceptable but could be better`);
    } else {
      console.log(`\n   ❌ Success rate is too low. Check embeddings and data quality.`);
    }

    console.log('\n' + '═'.repeat(70) + '\n');

    // Exit with appropriate code
    if (failed === 0) {
      console.log('✅ All tests passed!\n');
      process.exit(0);
    } else {
      console.log(`⚠️  ${failed} test(s) failed\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    logger.error('Test failed:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

testKnowledgeBase();
