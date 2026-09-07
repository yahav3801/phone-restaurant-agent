const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  category: String,
});

// Customer subdocument schema
const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false,
  },
  phoneNumber: {
    type: String,
    required: false,
  },
  deliveryAddress: {
    type: String,
    required: false,
  },
}, { _id: false }); // No separate _id for subdocument

const orderSchema = new mongoose.Schema(
  {
    callId: {
      type: String,
      index: true, // Index for fast lookup by callId
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    // Customer data object (unified)
    customer: {
      type: customerSchema,
      required: false,
    },
    // Individual fields (kept for backward compatibility)
    customerName: {
      type: String,
      required: false, // Will be filled during conversation
    },
    phoneNumber: {
      type: String,
      required: false, // Will be filled on Order creation
    },
    items: {
      type: [orderItemSchema],
      default: [], // Starts empty
    },
    total: {
      type: Number,
      required: false, // Starts at 0, required only when finalized
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["in_progress", "pending_payment", "paid", "cancelled"],
      default: "in_progress",
    },
    paymentType: {
      type: String,
      enum: ["delivery", "pickup"],
      required: false, // Will be filled during conversation
    },
    deliveryAddress: {
      type: String,
    },
    paymentLinkId: {
      type: String,
    },
    paymentLink: {
      type: String,
    },
    meshulamTransactionId: {
      type: String,
      index: true, // Index for fast lookup by transaction ID
    },
  },
  {
    timestamps: true,
    versionKey: "__v", // Enable optimistic locking with version key (explicit)
  }
);

// Pre-save middleware for optimistic locking
// Automatically increment version on each save to detect concurrent modifications
orderSchema.pre("save", function (next) {
  this.increment(); // Increments __v on each save
  next();
});

// Compound index for common queries (restaurant orders by status and date)
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });

// Index on transaction ID for webhook lookups
orderSchema.index({ meshulamTransactionId: 1 });

// Compound index for finding in-progress orders by callId
orderSchema.index({ callId: 1, status: 1 });

module.exports = mongoose.model("Order", orderSchema);
