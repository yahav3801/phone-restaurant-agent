const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true
  },
  inStock: {
    type: Boolean,
    default: true
  }
});

const restaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  vapiPhoneNumber: {
    type: String,
    required: true
  },
  menu: [menuItemSchema],
  meshulamApiKey: {
    type: String,
    required: true
  },
  meshulamTerminalNumber: {
    type: String,
    required: true
  },
  systemPrompt: {
    type: String,
    default: ''
  },
  firstMessage: {
    type: String,
    default: 'שלום! איך אוכל לעזור לך היום?'
  },
  businessInfo: {
    type: String,
    default: ''
  },
  humanRedirectPhone: {
    type: String
  },
  businessHours: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // VAPI Multi-Account Configuration (per-restaurant VAPI credentials)
  vapi: {
    apiKey: {
      type: String,
      required: false  // Will be required after migration
    },
    workflowId: {
      type: String,
      required: false  // Populated after workflow creation
    },
    phoneNumberId: {
      type: String,
      required: false  // VAPI phone number ID
    },
    webhookSecret: {
      type: String,
      required: false  // Per-restaurant webhook authentication
    }
  },

  // Workflow Configuration (restaurant-specific workflow customization)
  workflowConfig: {
    firstMessage: {
      type: String,
      default: 'שלום! איך אוכל לעזור לך היום?'
    },
    voiceSettings: {
      provider: {
        type: String,
        default: 'cartesia'
      },
      model: {
        type: String,
        default: 'sonic-3'
      },
      voiceId: {
        type: String,
        default: '3e32f3c5-9ac0-4192-9994-87fdb277120f'  // Cartesia Sonic 3 Hebrew voice
      },
      language: {
        type: String,
        default: 'he'
      }
    },
    customNodes: {
      type: mongoose.Schema.Types.Mixed,
      default: {}  // Restaurant-specific workflow node customizations
    }
  }
}, {
  timestamps: true
});

// Index for fast restaurant lookup by Vapi phone number
restaurantSchema.index({ vapiPhoneNumber: 1 });

// Index for workflow lookup (optional, for future use)
restaurantSchema.index({ 'vapi.workflowId': 1 });

module.exports = mongoose.model('Restaurant', restaurantSchema);
