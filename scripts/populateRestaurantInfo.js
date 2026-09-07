require('dotenv').config();
const mongoose = require('mongoose');
const KnowledgeBase = require('../src/models/KnowledgeBase');
const Restaurant = require('../src/models/Restaurant');
const { generateEmbedding } = require('../src/utils/embeddings');
const connectDB = require('../src/db/mongodb');
const logger = require('../src/utils/logger');

/**
 * Restaurant info Q&A data (Hebrew)
 */
const restaurantInfo = [
  {
    category: 'hours',
    question: 'מה שעות הפעילות?',
    answer: 'אנחנו פתוחים מ-08:00 עד 22:00 כל ימות השבוע. בשישי עד 15:00 ובשבת אנחנו סגורים.',
    response_guidelines: 'ציין את שעות הפתיחה הרגילות והמיוחדות של שישי/שבת',
    keywords: ['שעות', 'פתוח', 'סגור', 'מתי', 'זמין', 'פועלים']
  },
  {
    category: 'kosher',
    question: 'המסעדה כשרה?',
    answer: 'כן, אנחנו כשרים לחלוטין עם תעודת כשרות מהרבנות המקומית. כשרות מהדרין.',
    response_guidelines: 'אשר שהמסעדה כשרה והזכר את רמת הכשרות (מהדרין)',
    keywords: ['כשר', 'כשרות', 'רבנות', 'מהדרין', 'כשרויות']
  },
  {
    category: 'delivery',
    question: 'אתם עושים משלוחים?',
    answer: 'כן, אנחנו עושים משלוחים לכל אזור תל אביב והסביבה. זמן אספקה: 30-45 דקות. משלוח חינם מעל 80 ש"ח.',
    response_guidelines: 'הזכר את אזור המשלוח, זמן האספקה, ותנאי המשלוח החינמי',
    keywords: ['משלוח', 'דליברי', 'הביתה', 'הובלה', 'שליחות']
  },
  {
    category: 'payment',
    question: 'איך אפשר לשלם?',
    answer: 'אפשר לשלם במזומן, כרטיס אשראי, ביט, או אפליקציות תשלום דיגיטליות.',
    response_guidelines: 'ציין את כל אמצעי התשלום הזמינים',
    keywords: ['תשלום', 'כרטיס', 'מזומן', 'ביט', 'אשראי', 'לשלם']
  },
  {
    category: 'reservation',
    question: 'צריך להזמין מקום מראש?',
    answer: 'מומלץ להזמין מקום מראש, במיוחד בסופי שבוע ובערבים. ניתן להזמין דרך הטלפון או באתר.',
    response_guidelines: 'המלץ להזמין מראש והסבר איך להזמין',
    keywords: ['הזמנה', 'מקום', 'שריון', 'רזרבציה', 'שולחן']
  },
  {
    category: 'parking',
    question: 'יש חניה?',
    answer: 'יש חניה בתשלום ברחוב וחניון ציבורי במרחק 2 דקות הליכה.',
    response_guidelines: 'הסבר את אפשרויות החניה הקרובות',
    keywords: ['חניה', 'חנייה', 'לחנות', 'מקום חניה', 'רכב']
  },
  {
    category: 'vegan',
    question: 'יש אפשרויות טבעוניות?',
    answer: 'כן, יש לנו מגוון רחב של מנות טבעוניות וצמחוניות. ניתן להתאים כמעט כל מנה.',
    response_guidelines: 'אשר שיש אפשרויות טבעוניות והזכר גמישות בהתאמות',
    keywords: ['טבעוני', 'צמחוני', 'ללא מוצרים מן החי', 'vegan', 'ירקות']
  }
];

/**
 * Populate restaurant info Q&A with embeddings
 */
async function populateRestaurantInfo() {
  try {
    await connectDB();
    console.log('\n🔄 Starting restaurant info population\n');

    // Get the default restaurant (or specify restaurantId)
    const restaurant = await Restaurant.findOne();
    if (!restaurant) {
      console.log('❌ No restaurant found. Run seed.js first.');
      process.exit(1);
    }

    console.log(`🏪 Restaurant: ${restaurant.name}`);
    console.log(`📝 Adding ${restaurantInfo.length} info documents\n`);

    let createdCount = 0;
    let skippedCount = 0;
    let errors = [];

    for (const info of restaurantInfo) {
      try {
        // Check if already exists
        const existing = await KnowledgeBase.findOne({
          restaurantId: restaurant._id,
          type: 'info',
          category: info.category
        });

        if (existing) {
          logger.debug(`Skipping existing info: ${info.category}`);
          skippedCount++;
          console.log(`  ⏭️  ${info.category} (already exists)`);
          continue;
        }

        // Generate embedding for question + answer + keywords
        const embeddingText = `${info.question} ${info.answer} ${info.keywords.join(' ')}`;
        console.log(`  📊 Generating embedding for: ${info.category}...`);
        const embedding = await generateEmbedding(embeddingText);

        // Create knowledge_base document
        const knowledgeDoc = new KnowledgeBase({
          type: 'info',
          restaurantId: restaurant._id,
          embedding,
          embeddingModel: 'text-embedding-3-small',

          // Info-specific fields
          category: info.category,
          question: info.question,
          answer: info.answer,
          response_guidelines: info.response_guidelines,
          keywords: info.keywords
        });

        await knowledgeDoc.save();
        createdCount++;

        console.log(`  ✅ ${info.category}: "${info.question.substring(0, 40)}..."`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        errors.push({ category: info.category, error: error.message });
        logger.error(`Error creating info ${info.category}:`, {
          error: error.message
        });
        console.log(`  ❌ ${info.category}: ${error.message}`);
      }
    }

    console.log(`\n📈 Population Summary:`);
    console.log(`   Total: ${restaurantInfo.length}`);
    console.log(`   ✅ Created: ${createdCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errors.length}`);

    // Show knowledge base summary
    const menuCount = await KnowledgeBase.countDocuments({
      restaurantId: restaurant._id,
      type: 'menu'
    });
    const infoCount = await KnowledgeBase.countDocuments({
      restaurantId: restaurant._id,
      type: 'info'
    });

    console.log(`\n📊 Knowledge Base Summary:`);
    console.log(`   🍽️  Menu items: ${menuCount}`);
    console.log(`   ℹ️  Restaurant info: ${infoCount}`);
    console.log(`   📚 Total: ${menuCount + infoCount}`);

    // Show sample info document
    if (createdCount > 0) {
      const sample = await KnowledgeBase.findOne({ type: 'info' });
      console.log(`\n📝 Sample info document:`);
      console.log(`   Category: ${sample.category}`);
      console.log(`   Question: ${sample.question}`);
      console.log(`   Answer: ${sample.answer.substring(0, 60)}...`);
      console.log(`   Keywords: ${sample.keywords.join(', ')}`);
    }

  } catch (error) {
    console.error('\n❌ Population failed:', error.message);
    logger.error('Population failed:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed\n');
  }
}

// Run population
populateRestaurantInfo()
  .then(() => {
    console.log('✅ Restaurant info populated successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Population failed:', error);
    process.exit(1);
  });
