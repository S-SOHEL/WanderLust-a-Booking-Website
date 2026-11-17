const Booking = require("../models/booking.js");

/**
 * Automatically transitions Confirmed bookings whose checkOut date is in the past
 * to Completed status.
 */
async function autoUpdateCompletedBookings() {
  try {
    const now = new Date();
    const result = await Booking.updateMany(
      {
        status: "Confirmed",
        checkOut: { $lte: now },
      },
      {
        $set: { status: "Completed" },
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`[BookingLifecycle] Automatically completed ${result.modifiedCount} past reservation(s).`);
    }
    return result;
  } catch (err) {
    console.error("[BookingLifecycle] Error completing past bookings:", err.message);
    return null;
  }
}

let schedulerTimer = null;

/**
 * Initializes and starts the background recurring lifecycle scheduler.
 * Runs once immediately upon invocation and then every intervalMs.
 *
 * @param {number} intervalMs - Recurrence interval in milliseconds (default: 15 minutes)
 * @returns {NodeJS.Timeout} Active timer instance
 */
function startBookingLifecycleScheduler(intervalMs = 15 * 60 * 1000) {
  // Run on startup
  autoUpdateCompletedBookings();
  
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }
  
  schedulerTimer = setInterval(autoUpdateCompletedBookings, intervalMs);
  return schedulerTimer;
}

/**
 * Stops the recurring lifecycle scheduler.
 */
function stopBookingLifecycleScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  autoUpdateCompletedBookings,
  startBookingLifecycleScheduler,
  stopBookingLifecycleScheduler,
};
