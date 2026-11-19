const express = require("express");
const router = express.Router();
const passport = require("passport");
const wrapAsync = require("../utils/wrapAsync.js");
const { isAdmin, saveRedirectUrl, validateListing } = require("../middleware.js");
const adminController = require("../controller/admin.js");
const { upload } = require("../cloudConfig.js");

// Admin Authentication Routes
router
  .route("/login")
  .get(adminController.renderLoginForm)
  .post(
    saveRedirectUrl,
    passport.authenticate("local", {
      failureFlash: true,
      failureRedirect: "/admin/login",
    }),
    adminController.login
  );

// All routes below require Admin privileges (isAdmin)
router.use(isAdmin);

// Admin Dashboard
router.get("/dashboard", wrapAsync(adminController.dashboard));

// Admin Listing Management
router
  .route("/listings")
  .get(wrapAsync(adminController.listListings))
  .post(
    upload.any(),
    validateListing,
    wrapAsync(adminController.createListing)
  );

router.get("/listings/new", adminController.renderNewListingForm);

router
  .route("/listings/:id")
  .put(
    upload.any(),
    validateListing,
    wrapAsync(adminController.updateListing)
  )
  .delete(wrapAsync(adminController.deleteListing));

router.get("/listings/:id/edit", wrapAsync(adminController.renderEditListingForm));
router.patch("/listings/:id/toggle-publish", wrapAsync(adminController.togglePublish));
router.patch("/listings/:id/approve", wrapAsync(adminController.approveListing));
router.patch("/listings/:id/reject", wrapAsync(adminController.rejectListing));
router.patch("/listings/:id/fix-location", wrapAsync(adminController.fixListingLocation));

// Admin Location Integrity & Quality Management (Phase 9.3)
router.get("/locations", wrapAsync(adminController.locationIntegrityDashboard));

// Admin Controlled Remediation Queue (Phase 9.3.2)
router.get("/remediation", wrapAsync(adminController.remediationQueue));
router.patch("/remediation/:id/status", wrapAsync(adminController.updateRemediationStatus));

// Admin Booking Management
router.get("/bookings", wrapAsync(adminController.listBookings));
router.patch("/bookings/:id/approve", wrapAsync(adminController.approveBooking));
router.patch("/bookings/:id/reject", wrapAsync(adminController.rejectBooking));

// Admin Users Management
router.get("/users", wrapAsync(adminController.listUsers));
router.patch("/users/:id/toggle-role", wrapAsync(adminController.toggleUserRole));

// Admin Hosts Management
router.get("/hosts", wrapAsync(adminController.listHosts));

// Admin Reviews Moderation
router.get("/reviews", wrapAsync(adminController.listReviews));
router.delete("/reviews/:id", wrapAsync(adminController.deleteReview));

module.exports = router;
