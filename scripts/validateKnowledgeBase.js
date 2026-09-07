const mongoose = require('mongoose');
const KnowledgeBase = require('../src/models/KnowledgeBase');
require('dotenv').config();

/**
 * Database Validation Script for Knowledge Base
 *
 * Checks for:
 * - Invalid prices (<=0 or >500)
 * - Corrupted names (English characters in Hebrew menu)
 * - Invalid embeddings (missing or wrong dimensions)
 * - Missing required fields
 */

async function validateMenuItems() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all knowledge base items
    const items = await KnowledgeBase.find({ type: 'menu' }).lean();
    console.log(`📊 Found ${items.length} menu items to validate\n`);

    const issues = [];
    let validCount = 0;

    items.forEach((item, index) => {
      let hasIssues = false;

      // Price validation
      if (!item.price || item.price <= 0 || item.price > 500) {
        issues.push(`❌ ${item.name}: Invalid price (${item.price})`);
        hasIssues = true;
      }

      // Name validation (detect English characters in Hebrew menu)
      if (/[a-zA-Z]/.test(item.name)) {
        issues.push(`❌ ${item.name}: Contains English characters`);
        hasIssues = true;
      }

      // Description validation (optional, but warn if suspiciously short)
      if (!item.description || item.description.length < 3) {
        issues.push(`⚠️  ${item.name}: Missing or very short description`);
        hasIssues = true;
      }

      // Embedding validation
      if (!item.embedding) {
        issues.push(`❌ ${item.name}: Missing embedding`);
        hasIssues = true;
      } else if (!Array.isArray(item.embedding)) {
        issues.push(`❌ ${item.name}: Embedding is not an array`);
        hasIssues = true;
      } else if (item.embedding.length !== 1536) {
        issues.push(`❌ ${item.name}: Embedding has wrong dimensions (${item.embedding.length} instead of 1536)`);
        hasIssues = true;
      }

      // Category validation
      if (!item.category) {
        issues.push(`⚠️  ${item.name}: Missing category`);
        hasIssues = true;
      }

      // inStock validation (should be boolean)
      if (typeof item.inStock !== 'boolean') {
        issues.push(`⚠️  ${item.name}: inStock is not a boolean (${typeof item.inStock})`);
        hasIssues = true;
      }

      if (!hasIssues) {
        validCount++;
      }
    });

    // Print results
    console.log('═'.repeat(70));
    console.log('VALIDATION RESULTS');
    console.log('═'.repeat(70));

    if (issues.length === 0) {
      console.log('✅ All menu items are valid!');
      console.log(`   Total items checked: ${items.length}`);
    } else {
      console.log(`\n❌ Found ${issues.length} issue(s):\n`);
      issues.forEach(issue => console.log(`   ${issue}`));

      console.log(`\n📊 Summary:`);
      console.log(`   Valid items: ${validCount}/${items.length}`);
      console.log(`   Items with issues: ${items.length - validCount}/${items.length}`);
    }

    console.log('═'.repeat(70));

  } catch (error) {
    console.error('\n❌ Error during validation:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run validation
validateMenuItems().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
