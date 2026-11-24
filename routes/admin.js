const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const wrapAsync = require("../utils/wrapAsync.js");
const { isAdmin, saveRedirectUrl, validateListing } = require("../middleware.js");
const adminController = require("../controller/admin.js");
const { upload } = require("../cloudConfig.js");
const multer = require("multer");

// Multer memory storage for private evidence documents (never saved unencrypted to disk)
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// Rate limiters for admin authentication endpoints
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash("error", "Too many admin login attempts from this IP address. Please try again after 15 minutes.");
    res.redirect("/admin/login");
  },
});

const admin2faLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash("error", "Too many 2FA verification attempts from this IP address. Please try again after 15 minutes.");
    res.redirect("/admin/verify-2fa");
  },
});

// Admin Step 1: Password Authentication
router
  .route("/login")
  .get(adminController.renderLoginForm)
  .post(adminLoginLimiter, wrapAsync(adminController.login));

// Admin Step 2: Two-Factor Authentication Verification
router
  .route("/verify-2fa")
  .get(adminController.renderVerify2FA)
  .post(admin2faLimiter, wrapAsync(adminController.verify2FA));

// Admin 2FA Setup / Mandatory Initial Enrollment
router
  .route("/setup-2fa")
  .get(wrapAsync(adminController.renderSetup2FA))
  .post(wrapAsync(adminController.setup2FA));

// Admin One-Time Recovery Codes Display
router.get("/recovery-codes", adminController.renderRecoveryCodes);

// Admin Invalidate Session & Logout
router.get("/logout", adminController.logout);
router.post("/logout", adminController.logout);

// All routes below require Admin privileges and verified 2FA (isAdmin)
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

// =========================================================================
// Admin Evidence Vault Management (Phase 10.7)
// Strictly protected by router.use(isAdmin) above (requires 2FA)
// =========================================================================
router.get("/evidence", wrapAsync(adminController.listEvidence));
router.post(
  "/evidence/upload",
  evidenceUpload.single("document"),
  wrapAsync(adminController.uploadEvidence)
);
router.patch("/evidence/:id/verify", wrapAsync(adminController.verifyEvidence));
router.patch("/evidence/:id/revoke", wrapAsync(adminController.revokeEvidence));
router.get("/evidence/:id/download", wrapAsync(adminController.downloadEvidence));
router.get("/evidence/:id/signed-token", wrapAsync(adminController.generateEvidenceSignedToken));
router.get("/evidence/stream/:token", wrapAsync(adminController.streamEvidenceWithToken));
router.get("/evidence/:id/audit", wrapAsync(adminController.getEvidenceAuditTrail));

module.exports = router;
