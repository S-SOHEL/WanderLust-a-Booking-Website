const mongoose = require("mongoose");
const Listing = require("./models/listing");
const Review = require("./models/review");
const ExpressError = require("./utils/ExpressError");
const { listingSchema, reviewSchema } = require("./schema");

module.exports.isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes("application/json") && !req.headers.accept.includes("text/html"))) {
      return res.status(401).json({ success: false, message: "You must be logged in first!" });
    }
    req.session.redirectUrl = req.originalUrl;
    req.flash("error", "You must be logged in first!");
    return res.redirect("/login");
  }
  next();
};

module.exports.saveRedirectUrl = (req, res, next) => {
  if (req.session.redirectUrl && !req.session.redirectUrl.includes("/login")) {
    res.locals.redirectUrl = req.session.redirectUrl;
    delete req.session.redirectUrl;
  }
  next();
};

// Admin only middleware
module.exports.isAdmin = (req, res, next) => {
  const wantsJson =
    req.xhr ||
    (req.headers.accept &&
      req.headers.accept.includes("application/json") &&
      !req.headers.accept.includes("text/html"));

  if (!req.isAuthenticated()) {
    if (wantsJson) {
      return res.status(401).json({ success: false, message: "Administrator authentication required." });
    }
    req.session.redirectUrl = req.originalUrl;
    req.flash("error", "Please log in with an administrator account.");
    return res.redirect("/admin/login");
  }
  if (req.user.role !== "admin") {
    if (wantsJson) {
      return res.status(403).json({ success: false, message: "Access denied: Administrator privileges required." });
    }
    req.flash("error", "Access denied: Administrator privileges required.");
    return res.redirect("/listings");
  }
  next();
};

// Owner or Admin check for modifying/deleting listings
module.exports.isOwner = async (req, res, next) => {
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
  // Admins can manage any listing
  if (req.user && req.user.role === "admin") {
    return next();
  }
  // Otherwise user must be the listing owner
  if (!listing.owner || !listing.owner.equals(res.locals.currUser._id)) {
    req.flash("error", "You do not have permission to modify this property!");
    return res.redirect(`/listings/${id}`);
  }
  next();
};

// Validate listing creation and updates
module.exports.validateListing = (req, res, next) => {
  // Normalize amenities if submitted as root-level or single string checkbox
  if (req.body.amenities && req.body.listing && !req.body.listing.amenities) {
    req.body.listing.amenities = req.body.amenities;
  }
  if (req.body.listing && typeof req.body.listing.amenities === "string") {
    req.body.listing.amenities = [req.body.listing.amenities];
  }
  if (Array.isArray(req.body.amenities) && req.body.listing) {
    req.body.listing.amenities = req.body.amenities;
  }

  // Synthesize location if city/state are provided without an explicit location
  if (req.body.listing && !req.body.listing.location && req.body.listing.city) {
    req.body.listing.location = req.body.listing.city + (req.body.listing.state ? `, ${req.body.listing.state}` : "");
  }

  const { error } = listingSchema.validate(req.body, { abortEarly: false });
  if (error) {
    const errMsg = error.details.map((el) => el.message).join(" · ");
    throw new ExpressError(400, errMsg);
  } else {
    next();
  }
};

module.exports.validateReview = (req, res, next) => {
  const { error } = reviewSchema.validate(req.body);
  if (error) {
    const errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  } else {
    next();
  }
};

module.exports.isReviewAuthor = async (req, res, next) => {
  const { id, reviewId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(reviewId)) {
    req.flash("error", "Review not found!");
    return res.redirect("/listings");
  }
  const review = await Review.findById(reviewId);
  if (!review) {
    req.flash("error", "Review not found!");
    return res.redirect(`/listings/${id}`);
  }
  // Admins can delete any review
  if (req.user && req.user.role === "admin") {
    return next();
  }
  if (!review.author || !review.author.equals(res.locals.currUser._id)) {
    req.flash("error", "You are not the author of this review!");
    return res.redirect(`/listings/${id}`);
  }
  next();
};
