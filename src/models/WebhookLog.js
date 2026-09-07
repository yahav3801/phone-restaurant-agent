const mongoose = require('mongoose');

/**
 * WebhookLog Model
 * Tracks processed webhook tool calls to implement idempotency
 * Prevents duplicate processing of retried webhook requests
 */
const webhookLogSchema = new mongoose.Schema({
  toolCallId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  callId: {
    type: String,
    required: true,
    index: true,
  },
  functionName: {
    type: String,
    required: true,
  },
  parameters: mongoose.Schema.Types.Mixed,
  result: mongoose.Schema.Types.Mixed,
  processedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Auto-delete old webhook logs after 24 hours to prevent database bloat
webhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('WebhookLog', webhookLogSchema);
