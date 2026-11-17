const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
  bookingRef: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  listing: {
    type: Schema.Types.ObjectId,
    ref: "Listing",
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  checkIn: {
    type: Date,
    required: true,
  },
  checkOut: {
    type: Date,
    required: true,
  },
  totalGuests: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
  totalNights: {
    type: Number,
    required: true,
    min: 1,
  },
  pricePerNight: {
    type: Number,
    default: 0,
  },
  basePrice: {
    type: Number,
    required: true,
  },
  tax: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Confirmed", "Rejected", "Cancelled", "Completed"],
    default: "Pending",
  },
  hasReviewed: {
    type: Boolean,
    default: false,
  },
  rejectionReason: {
    type: String,
    default: "",
  },
  specialRequests: {
    type: String,
    default: "",
  },
  cancelledAt: {
    type: Date,
  },
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  reviewedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for fast lookup and overlapping booking verification
bookingSchema.index({ listing: 1, status: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
