const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, isOwner, validateListing } = require("../middleware.js");
const listingController = require("../controller/listing.js");
const { upload } = require("../cloudConfig.js");

// Index & Create Route
router
  .route("/")
  .get(wrapAsync(listingController.index))
  .post(
    isLoggedIn,
    upload.any(),
    validateListing,
    wrapAsync(listingController.createListing)
  );

// Search Route (MUST be defined before /:id)
router.get("/search", wrapAsync(listingController.searchListings));

// New Route (MUST be defined before /:id)
router.get("/new", isLoggedIn, listingController.renderNewForm);

// Show, Update & Delete Routes
router
  .route("/:id")
  .get(wrapAsync(listingController.showListing))
  .put(
    isLoggedIn,
    isOwner,
    upload.any(),
    validateListing,
    wrapAsync(listingController.updateListing)
  )
  .delete(
    isLoggedIn,
    isOwner,
    wrapAsync(listingController.destroyListing)
  );

// Edit Route
router.get(
  "/:id/edit",
  isLoggedIn,
  isOwner,
  wrapAsync(listingController.renderEditForm)
);

// Wishlist Persistence Routes
router.post("/:id/wishlist", isLoggedIn, wrapAsync(listingController.toggleWishlist));
router.delete("/:id/wishlist", isLoggedIn, wrapAsync(listingController.removeFromWishlist));

module.exports = router;
