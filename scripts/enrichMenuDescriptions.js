require('dotenv').config();
const mongoose = require('mongoose');
const MenuItem = require('../src/models/MenuItem');
const { generateEmbedding } = require('../src/utils/embeddings');

// Enriched descriptions with more context for better vector search
const enrichedDescriptions = {
  'אנטריקוט 300 גרם': 'אנטריקוט בקר עסיסי ורך, נתח בשר איכותי מובחר, מוגש עם רוטב ותיבול מושלם, מנת בשר עיקרית',
  'אנטריקוט 400 גרם': 'אנטריקוט בקר עסיסי גדול במיוחד, נתח בשר איכותי מובחר, מנה גדולה לאוהבי בשר, מנת בשר עיקרית',
  'פילה בקר 250 גרם': 'פילה בקר רך ועסיסי, נתח בשר מעולה ואיכותי, חתיכת בשר מובחרת, מנת בשר עיקרית',
  'המבורגר הבוקרים 200 גרם': 'המבורגר בקר טרי בלחמניה, בשר טחון איכותי עם ירקות טריים, עגבנייה, חסה ובצל, כולל תוספות',
  'המבורגר הבוקרים 300 גרם': 'המבורגר בקר כפול גדול בלחמניה, בשר טחון איכותי עם ירקות טריים, עגבנייה, חסה ובצל, כולל תוספות',
  'צלעות בקר': 'צלעות בקר מעושנות ברוטב BBQ, בשר רך ועסיסי, נופל מהעצם, מנת בשר עיקרית',
  'שיפודי בקר': 'שיפודי בשר בקר עם ירקות צלויים, קוביות בשר רך ועסיסי עם בצל ופלפלים על האש',
  'עוף שלם על האש': 'עוף שלם צלוי על האש, עוף רך ועסיסי עם תיבול מושלם, מנת עוף עיקרית',
  'שניצל עוף': 'שניצל עוף פריך וטעים עם תוספות, עוף מטוגן בפירורי לחם, מנת עוף עיקרית',

  'צ\'יפס': 'צ\'יפס פריך וטעים, תפוחי אדמה מטוגנים פריכים בשמן חם, תוספת קלאסית',
  'בטטה': 'בטטה מטוגנת פריכה וטעימה, פרוסות בטטה מתוקה מטוגנות, תוספת מיוחדת',
  'אורז': 'אורז לבן מבושל, תוספת אורז קלאסית למנות בשר',
  'פירה': 'פורה עשירה וקרמית, תפוחי אדמה מעוכים עם חמאה, תוספת עשירה',
  'סלט ירוק': 'סלט עלים טרי וירוק, ירקות ירוקים טריים עם רוטב ויניגרט',
  'סלט קולסלאו': 'סלט כרוב טרי ועסיסי, כרוב מגורד עם רוטב מיונז',

  'קולה': 'קוקה קולה 330 מ"ל, משקה קר ומרענן, משקה מוגז',
  'קולה זירו': 'קוקה קולה זירו 330 מ"ל, משקה מוגז קר ללא סוכר, משקה דיאט',
  'ספרייט': 'ספרייט 330 מ"ל, משקה לימון מרענן, משקה מוגז קר',
  'מים': 'מים מינרליים 500 מ"ל, בקבוק מים צלול וקר',
  'בירה': 'בירה 330 מ"ל, משקה אלכוהולי קר ומרענן',

  'עוגת שוקולד': 'עוגת שוקולד עשירה וטעימה, קינוח מתוק עם שוקולד מריר',
  'גלידה': 'גלידה קרה ומתוקה בטעמים לבחירה, קינוח קר מרענן'
};

async function enrichDescriptions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const items = await MenuItem.find();
    console.log(`Found ${items.length} menu items to enrich\n`);

    let updated = 0;
    let skipped = 0;

    for (const item of items) {
      const enriched = enrichedDescriptions[item.name];

      if (!enriched) {
        console.log(`⚠ No enriched description for: ${item.name}`);
        skipped++;
        continue;
      }

      if (item.description === enriched) {
        console.log(`⏭ Skipping ${item.name} (already enriched)`);
        skipped++;
        continue;
      }

      console.log(`\n📝 Updating: ${item.name}`);
      console.log(`   Old: ${item.description}`);
      console.log(`   New: ${enriched}`);

      // Generate new embedding with enriched description
      const textForEmbedding = `${item.name} ${enriched}`.trim();
      const embedding = await generateEmbedding(textForEmbedding);

      // Update item
      item.description = enriched;
      item.embedding = embedding;
      await item.save();

      console.log(`   ✓ Updated with new embedding`);
      updated++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n✅ Enrichment complete!`);
    console.log(`   Updated: ${updated} items`);
    console.log(`   Skipped: ${skipped} items`);

  } catch (error) {
    console.error('✗ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

console.log('='.repeat(60));
console.log('Menu Description Enrichment Script');
console.log('='.repeat(60));

enrichDescriptions();
