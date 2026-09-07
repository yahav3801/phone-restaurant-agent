require("dotenv").config();
const mongoose = require("mongoose");
const Restaurant = require("../src/models/Restaurant");

async function seed() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Check if restaurants already exist
    const existingRestaurants = await Restaurant.countDocuments();
    if (existingRestaurants > 0) {
      console.log(
        `Database already has ${existingRestaurants} restaurant(s). Skipping seed.`
      );
      console.log(
        "To re-seed, delete all restaurants first or modify this script."
      );
      process.exit(0);
    }

    // Create test restaurant
    const restaurant = new Restaurant({
      name: "מסעדת הבוקרים",
      phoneNumber: "+972502766979", // Restaurant's contact phone number
      vapiPhoneNumber: "+97233823956", // Vapi AI phone number for incoming calls
      meshulamApiKey: "your_grow_api_key_here", // TODO: Get from Grow.il dashboard
      meshulamTerminalNumber: "your_terminal_number_here", // TODO: Get from Grow.il dashboard
      humanRedirectPhone: "+972502766979", // Human support redirect number

      // Dynamic AI Configuration
      systemPrompt: `אתה סוכן טלפוני עבור מסעדת הבוקרים.

טון ואישיות:
- חברותי ומקצועי
- מהיר ויעיל
- סבלני עם לקוחות

חוקים קריטיים למניעת המצאת מנות:
1. תמיד קרא לפונקציה get_menu() לפני שמדברים על מנות
2. אסור להזכיר מנות שלא מופיעות בתפריט שחזר מ-get_menu()
3. אם לקוח מבקש מנה שלא קיימת - הצע חלופות מהתפריט האמיתי
4. אמת שכל מנה במלאי (inStock: true) לפני הצעה

מדיניות הזמנות:
- משלוח: עד 30 דקות, עלות 15 ש"ח
- איסוף עצמי: תוך 20 דקות
- הזמנה מינימלית למשלוח: 50 ש"ח
- תשלום: רק בקישור תשלום דיגיטלי

העברה לאדם:
- אם לקוח כועס או מתלונן
- אם יש בעיה עם הזמנה קיימת
- אם מבקשים להזמין שולחן (אנחנו לא עושים הזמנות מקום)
- אם יש שאלה שאתה לא יכול לענות עליה`,

      firstMessage:
        "מסעדת הבוקרים שלום! אני נציג בינה מלאכותית, איך אוכל לעזור?",

      businessInfo:
        "מסעדת בשרים כשרה. פתוח ראשון-חמישי 11:00-23:00, שישי 11:00-15:00, סגור בשבת.",
      address: "מתחם ביג קרית אתא",

      menu: [
        // מנות עיקריות - Main Dishes
        {
          name: "אנטריקוט 300 גרם",
          price: 120,
          category: "מנות בשר",
          description: "אנטריקוט בקר עסיסי",
          inStock: true,
        },
        {
          name: "אנטריקוט 400 גרם",
          price: 150,
          category: "מנות בשר",
          description: "אנטריקוט בקר עסיסי",
          inStock: true,
        },
        {
          name: "פילה בקר 250 גרם",
          price: 140,
          category: "מנות בשר",
          description: "פילה בקר רך ועסיסי",
          inStock: true,
        },
        {
          name: "המבורגר הבוקרים 200 גרם",
          price: 65,
          category: "המבורגרים",
          description: "המבורגר בקר burger hamburger בלחמניה עם ירקות ותוספות",
          inStock: true,
        },
        {
          name: "המבורגר הבוקרים 300 גרם",
          price: 85,
          category: "המבורגרים",
          description: "המבורגר בקר כפול burger hamburger בלחמניה עם ירקות ותוספות",
          inStock: true,
        },
        {
          name: "צלעות בקר",
          price: 110,
          category: "מנות בשר",
          description: "צלעות בקר ברוטב BBQ",
          inStock: true,
        },
        {
          name: "שיפודי בקר",
          price: 95,
          category: "מנות בשר",
          description: "שיפודי בקר עם ירקות",
          inStock: true,
        },
        {
          name: "עוף שלם על האש",
          price: 75,
          category: "מנות עוף",
          description: "עוף שלם צלוי על האש",
          inStock: true,
        },
        {
          name: "שניצל עוף",
          price: 55,
          category: "מנות עוף",
          description: "שניצל עוף פריך עם תוספות",
          inStock: true,
        },

        // תוספות - Sides
        {
          name: "צ'יפס",
          price: 18,
          category: "תוספות",
          description: "צ'יפס פריך",
          inStock: true,
        },
        {
          name: "בטטה",
          price: 22,
          category: "תוספות",
          description: "בטטה מטוגנת",
          inStock: true,
        },
        {
          name: "אורז",
          price: 15,
          category: "תוספות",
          description: "אורז לבן",
          inStock: true,
        },
        {
          name: "פירה",
          price: 18,
          category: "תוספות",
          description: "פירה עשירה",
          inStock: true,
        },
        {
          name: "סלט ירוק",
          price: 25,
          category: "סלטים",
          description: "סלט עלים טרי",
          inStock: true,
        },
        {
          name: "סלט קולסלאו",
          price: 20,
          category: "סלטים",
          description: "סלט כרוב טרי",
          inStock: true,
        },

        // משקאות - Drinks
        {
          name: "קולה",
          price: 12,
          category: "משקאות",
          description: 'קוקה קולה 330 מ"ל',
          inStock: true,
        },
        {
          name: "קולה זירו",
          price: 12,
          category: "משקאות",
          description: 'קוקה קולה זירו 330 מ"ל',
          inStock: true,
        },
        {
          name: "ספרייט",
          price: 12,
          category: "משקאות",
          description: 'ספרייט 330 מ"ל',
          inStock: true,
        },
        {
          name: "מים",
          price: 8,
          category: "משקאות",
          description: 'מים מינרליים 500 מ"ל',
          inStock: true,
        },
        {
          name: "בירה",
          price: 20,
          category: "משקאות",
          description: 'בירה 330 מ"ל',
          inStock: true,
        },

        // קינוחים - Desserts
        {
          name: "עוגת שוקולד",
          price: 35,
          category: "קינוחים",
          description: "עוגת שוקולד עשירה",
          inStock: true,
        },
        {
          name: "גלידה",
          price: 25,
          category: "קינוחים",
          description: "גלידה בטעמים לבחירה",
          inStock: true,
        },
      ],
      settings: {
        allowDelivery: true,
        allowPickup: true,
        deliveryFee: 15,
        minimumOrder: 50,
      },
    });

    await restaurant.save();
    console.log("✅ Successfully created restaurant: מסעדת הבוקרים");
    console.log(`Restaurant ID: ${restaurant._id}`);
    console.log("\n📝 TODO: Update the following fields:");
    console.log(
      "  1. vapiPhoneNumber - Get from Vapi dashboard after buying phone number"
    );
    console.log("  2. meshulamApiKey - Get from Grow.il dashboard");
    console.log("  3. meshulamTerminalNumber - Get from Grow.il dashboard");
    console.log("  4. humanRedirectPhone - Set to actual support phone number");
    console.log("\n🎉 Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("Database connection closed");
  }
}

// Run the seed function
seed();
