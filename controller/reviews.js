const mongoose = require("mongoose");
const Listing = require("../models/listing.js");
const Review = require("../models/review.js");
const Booking = require("../models/booking.js");
const { autoUpdateCompletedBookings } = require("../utils/bookingLifecycle.js");

module.exports.createReview = async (req, res) => {
  await autoUpdateCompletedBookings();

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.flash("error", "Listing does not exist!");
    return res.redirect("/listings");
  }
  const listing = await Listing.findById(id);

  if (!listing) {
    req.flash("error", "Listing does not exist!");
    return res.redirect("/listings");
  }

  // 1. Prevent host self-reviews
  if (listing.owner && listing.owner.equals(req.user._id)) {
    req.flash("error", "Hosts cannot submit reviews for their own listings.");
    return res.redirect(`/listings/${listing._id}`);
  }

  // 2. Find eligible completed stay for this guest
  const eligibleBooking = await Booking.findOne({
    listing: listing._id,
    user: req.user._id,
    status: "Completed",
    hasReviewed: { $ne: true },
  }).sort({ checkOut: -1 });

  if (!eligibleBooking) {
    // Check if user already reviewed or has an active/uncompleted reservation
    const pastReviewed = await Booking.findOne({
      listing: listing._id,
      user: req.user._id,
      status: "Completed",
      hasReviewed: true,
    });

    if (pastReviewed) {
      req.flash("error", "You have already submitted a review for your completed stay here.");
      return res.redirect(`/listings/${listing._id}`);
    }

    const anyBooking = await Booking.findOne({
      listing: listing._id,
      user: req.user._id,
    });

    if (anyBooking) {
      req.flash("error", "You can only review this property once your stay has officially completed.");
      return res.redirect(`/listings/${listing._id}`);
    }

    req.flash("error", "Only verified guests with a completed stay can write a review.");
    return res.redirect(`/listings/${listing._id}`);
  }

  // 3. Create verified review linked to booking and listing
  const newReview = new Review({
    comment: req.body.review.comment,
    rating: Number(req.body.review.rating),
    listing: listing._id,
    booking: eligibleBooking._id,
    bookingRef: eligibleBooking.bookingRef,
    isVerifiedStay: true,
    author: req.user._id,
  });

  await newReview.save();

  // Append to listing
  listing.reviews.push(newReview._id);
  await listing.save();

  // Mark booking as reviewed
  eligibleBooking.hasReviewed = true;
  await eligibleBooking.save();

  req.flash("success", "Thank you! Your verified review has been published.");
  res.redirect(`/listings/${listing._id}`);
};

module.exports.destroyReview = async (req, res) => {
  const { id, reviewId } = req.params;

  const review = await Review.findById(reviewId);
  if (review && review.booking) {
    // Re-allow reviewing if their review is removed
    await Booking.findByIdAndUpdate(review.booking, { hasReviewed: false });
  }

  // Remove review reference from listing
  await Listing.findByIdAndUpdate(id, {
    $pull: { reviews: reviewId },
  });

  // Delete review document
  await Review.findByIdAndDelete(reviewId);

  req.flash("success", "Review deleted successfully!");
  res.redirect(`/listings/${id}`);
};
