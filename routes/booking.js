const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../middleware.js");
const bookingController = require("../controller/bookings.js");

// Create booking for a specific listing
router.post("/listings/:id/bookings", isLoggedIn, wrapAsync(bookingController.createBooking));

// View logged-in user's reservations
router.get("/bookings", isLoggedIn, wrapAsync(bookingController.myBookings));

// Cancel a reservation
router.delete("/bookings/:id", isLoggedIn, wrapAsync(bookingController.cancelBooking));

module.exports = router;
