const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");

// Helper to generate unique booking reference
function generateBookingRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "WL-";
  for (let i = 0; i < 6; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ref;
}

module.exports.createBooking = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.flash("error", "Invalid property ID.");
    return res.redirect("/listings");
  }
  const { checkIn, checkOut, totalGuests = 1, specialRequests = "" } = req.body.booking || {};

  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing does not exist!");
    return res.redirect("/listings");
  }

  if (
    listing.isPublished === false ||
    ["pending", "rejected", "draft"].includes(listing.status)
  ) {
    req.flash("error", "This property is currently not accepting new reservations.");
    return res.redirect("/listings");
  }

  // Prevent host from booking their own place
  if (listing.owner && listing.owner.equals(req.user._id)) {
    req.flash("error", "You cannot book your own property!");
    return res.redirect(`/listings/${id}`);
  }

  const startDate = new Date(checkIn);
  const endDate = new Date(checkOut);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    req.flash("error", "Please provide valid check-in and check-out dates!");
    return res.redirect(`/listings/${id}`);
  }

  if (startDate < today) {
    req.flash("error", "Check-in date cannot be in the past!");
    return res.redirect(`/listings/${id}`);
  }

  if (endDate <= startDate) {
    req.flash("error", "Check-out date must be after check-in date!");
    return res.redirect(`/listings/${id}`);
  }

  const guestsCount = Number(totalGuests) || 1;
  if (listing.maxGuests && guestsCount > listing.maxGuests) {
    req.flash("error", `Maximum guest capacity for this property is ${listing.maxGuests}.`);
    return res.redirect(`/listings/${id}`);
  }

  // Check for conflicting confirmed bookings for the same property
  const conflict = await Booking.findOne({
    listing: id,
    status: "Confirmed",
    $or: [
      { checkIn: { $lt: endDate, $gte: startDate } },
      { checkOut: { $gt: startDate, $lte: endDate } },
      { checkIn: { $lte: startDate }, checkOut: { $gte: endDate } },
    ],
  });

  if (conflict) {
    req.flash("error", "The selected dates overlap with an existing confirmed booking. Please choose different dates.");
    return res.redirect(`/listings/${id}`);
  }

  const diffTime = endDate.getTime() - startDate.getTime();
  const totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (totalNights <= 0) {
    req.flash("error", "Reservation must be for at least 1 night.");
    return res.redirect(`/listings/${id}`);
  }

  const pricePerNight = listing.price || 0;
  const basePrice = pricePerNight * totalNights;
  const tax = Math.round(basePrice * 0.18); // 18% GST
  const totalPrice = basePrice + tax;

  // Generate unique bookingRef
  let bookingRef = generateBookingRef();
  let existingRef = await Booking.findOne({ bookingRef });
  while (existingRef) {
    bookingRef = generateBookingRef();
    existingRef = await Booking.findOne({ bookingRef });
  }

  const newBooking = new Booking({
    bookingRef,
    listing: id,
    user: req.user._id,
    checkIn: startDate,
    checkOut: endDate,
    totalGuests: guestsCount,
    totalNights,
    pricePerNight,
    basePrice,
    tax,
    totalPrice,
    specialRequests: specialRequests.trim(),
    status: "Pending", // Initial status as required
  });

  await newBooking.save();
  req.flash(
    "success",
    `Booking request submitted! Reference #${bookingRef}. Your request is pending host/admin review.`
  );
  res.redirect("/bookings");
};

module.exports.myBookings = async (req, res) => {
  const { autoUpdateCompletedBookings } = require("../utils/bookingLifecycle.js");
  await autoUpdateCompletedBookings();

  const bookings = await Booking.find({ user: req.user._id })
    .populate("listing")
    .sort({ createdAt: -1 });

  res.render("bookings/index.ejs", { bookings });
};

module.exports.cancelBooking = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.flash("error", "Invalid reservation ID.");
    return res.redirect("/bookings");
  }
  const booking = await Booking.findById(id).populate("listing");

  if (!booking) {
    req.flash("error", "Reservation not found!");
    return res.redirect("/bookings");
  }

  const isOwner = booking.user.equals(req.user._id);
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    req.flash("error", "You do not have permission to cancel this reservation!");
    return res.redirect("/bookings");
  }

  if (booking.status === "Cancelled") {
    req.flash("error", "This reservation has already been cancelled.");
    return res.redirect("/bookings");
  }

  if (booking.status === "Completed") {
    req.flash("error", "Completed reservations cannot be cancelled.");
    return res.redirect("/bookings");
  }

  booking.status = "Cancelled";
  booking.cancelledAt = new Date();
  await booking.save();

  req.flash("success", `Reservation #${booking.bookingRef} was cancelled successfully.`);
  res.redirect("/bookings");
};
