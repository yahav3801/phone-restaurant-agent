require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/db/mongodb');
const ragSearch = require('../src/services/ragSearch');
const Restaurant = require('../src/models/Restaurant');
const logger = require('../src/utils/logger');

/**
 * Test Atlas Vector Search vs Client-Side Search
 * Compares performance and quality
 */

const testQueries = [
  { query: 'אני רוצה פיצה', expectedType: 'menu' },
  { query: 'מה שעות הפתיחה?', expectedType: 'info' },
  { query: 'יש לכם סלטים?', expectedType: 'menu' },
  { query: 'עושים משלוחים?', expectedType: 'info' },
  { query: 'המבורגר עם תוספות', expectedType: 'menu' },
  { query: 'האם כשר?', expectedType: 'info' }
];

async function testAtlasVectorSearch() {
  try {
    await connectDB();
    console.log('\n🔬 Testing Atlas Vector Search\n');
    console.log('═'.repeat(70) + '\n');

    const restaurant = await Restaurant.findOne();
    if (!restaurant) {
      throw new Error('No restaurant found');
    }

    console.log(`🏪 Restaurant: ${restaurant.name}`);
    console.log(`⚙️  Mode: ${ragSearch.useAtlasVectorSearch ? 'Atlas Vector Search' : 'Client-Side Search'}\n`);

    if (!ragSearch.useAtlasVectorSearch) {
      console.log('⚠️  Warning: Atlas Vector Search not enabled');
      console.log('   Set USE_ATLAS_VECTOR_SEARCH=true in .env to test Atlas\n');
    }

    let totalDuration = 0;
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < testQueries.length; i++) {
      const test = testQueries[i];
      console.log(`Test ${i + 1}/${testQueries.length}: ${test.query}`);

      const start = Date.now();
      try {
        const results = await ragSearch.search(test.query, restaurant._id, {
          topK: 3
        });
        const duration = Date.now() - start;
        totalDuration += duration;

        console.log(`  Duration: ${duration}ms`);
        console.log(`  Results: ${results.length} items found`);

        if (results.length > 0) {
          const topResult = results[0];
          console.log(`  Top result: [${topResult.type}] ${topResult.type === 'menu' ? topResult.name : topResult.question.substring(0, 40)}`);
          console.log(`  Score: ${topResult.relevanceScore.toFixed(3)}`);

          if (topResult.type === test.expectedType) {
            console.log('  ✅ PASS\n');
            passed++;
          } else {
            console.log(`  ❌ FAIL: Expected ${test.expectedType}, got ${topResult.type}\n`);
            failed++;
          }
        } else {
          console.log('  ❌ FAIL: No results\n');
          failed++;
        }
      } catch (error) {
        console.log(`  ❌ ERROR: ${error.message}\n`);
        failed++;
      }
    }

    // Summary
    console.log('═'.repeat(70));
    console.log('\n📊 Test Results\n');
    console.log(`   Total tests: ${testQueries.length}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📈 Success Rate: ${((passed / testQueries.length) * 100).toFixed(1)}%`);
    console.log(`   ⏱️  Average latency: ${(totalDuration / testQueries.length).toFixed(0)}ms`);

    const avgLatency = totalDuration / testQueries.length;
    if (ragSearch.useAtlasVectorSearch) {
      if (avgLatency < 100) {
        console.log(`\n   🎉 Excellent! Atlas search is fast (<100ms average)`);
      } else if (avgLatency < 200) {
        console.log(`\n   ✅ Good performance`);
      } else {
        console.log(`\n   ⚠️  Slower than expected - check cluster tier and index`);
      }
    } else {
      console.log(`\n   ℹ️  Client-side search baseline: ${avgLatency.toFixed(0)}ms`);
    }

    console.log('\n' + '═'.repeat(70) + '\n');

    process.exit(failed === 0 ? 0 : 1);

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

testAtlasVectorSearch();
