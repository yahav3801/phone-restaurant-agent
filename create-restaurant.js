const mongoose = require('mongoose');

async function createRestaurant() {
  try {
    await mongoose.connect('mongodb://localhost:27017/restaurant_phone_agent');
    console.log('Connected to MongoDB');

    const Restaurant = require('./src/models/Restaurant');

    // Check if restaurant exists
    const existing = await Restaurant.findOne({ name: 'מסעדת הבוקרים' });
    if (existing) {
      console.log('✅ Restaurant already exists:', existing.name);
      process.exit(0);
    }

    // Create restaurant
    const restaurant = await Restaurant.create({
      name: 'מסעדת הבוקרים',
      phoneNumber: '+97233823956',
      address: 'תל אביב',
      businessHours: {
        sunday: { open: '11:00', close: '23:00' },
        monday: { open: '11:00', close: '23:00' },
        tuesday: { open: '11:00', close: '23:00' },
        wednesday: { open: '11:00', close: '23:00' },
        thursday: { open: '11:00', close: '23:00' },
        friday: { open: '11:00', close: '15:00' },
        saturday: { closed: true }
      }
    });

    console.log('✅ Restaurant created:', restaurant.name);
    console.log('ID:', restaurant._id);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createRestaurant();
