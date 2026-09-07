const mongoose = require('mongoose');

/**
 * Knowledge Base Model
 *
 * Unified collection for both menu items and restaurant info Q&A
 * Uses discriminator pattern with 'type' field
 *
 * Types:
 * - 'menu': Menu items (migrated from MenuItem)
 * - 'info': Restaurant Q&A (hours, kosher, delivery, etc.)
 */

const knowledgeBaseSchema = new mongoose.Schema({
  // ========== Common Fields ==========
  type: {
    type: String,
    required: true,
    enum: ['menu', 'info'],
    index: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length === 1536;
      },
      message: 'Embedding must be an array of 1536 numbers'
    }
  },
  embeddingModel: {
    type: String,
    default: 'text-embedding-3-small'
  },

  // ========== Menu-Specific Fields (type: 'menu') ==========
  name: {
    type: String,
    required: function() { return this.type === 'menu'; }
  },
  price: {
    type: Number,
    required: function() { return this.type === 'menu'; },
    min: 0
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: function() { return this.type === 'menu'; }
  },
  ingredients: {
    type: [String],
    default: []
  },
  inStock: {
    type: Boolean,
    default: true,
    index: true
  },

  // ========== Info-Specific Fields (type: 'info') ==========
  question: {
    type: String,
    required: function() { return this.type === 'info'; }
  },
  answer: {
    type: String,
    required: function() { return this.type === 'info'; }
  },
  response_guidelines: {
    type: String,
    default: ''
  },
  keywords: {
    type: [String],
    default: []
  }
}, {
  timestamps: true,
  collection: 'knowledge_base'
});

// Compound indexes for performance
knowledgeBaseSchema.index({ restaurantId: 1, type: 1 });
knowledgeBaseSchema.index({ restaurantId: 1, type: 1, inStock: 1 });
knowledgeBaseSchema.index({ restaurantId: 1, category: 1 });

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
