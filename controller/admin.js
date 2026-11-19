const path = require("path");
const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");
const User = require("../models/user.js");
const Review = require("../models/review.js");
const { autoUpdateCompletedBookings } = require("../utils/bookingLifecycle.js");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const {
  encryptSecret,
  decryptSecret,
  createSecret,
  verifyTOTP,
  generateTOTPUri,
  generateQRCodeDataURL,
  generateRecoveryCodes,
  findAndValidateRecoveryCode,
} = require("../utils/twoFactor.js");
const { verifyTurnstile } = require("../utils/turnstile.js");
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mapToken ? mbxGeocoding({ accessToken: mapToken }) : null;

// Helper to validate and parse coordinate pairs
function parseAndValidateCoordinates(manualLng, manualLat) {
  if (manualLng === undefined || manualLng === null || manualLng === "" ||
      manualLat === undefined || manualLat === null || manualLat === "") {
    return null;
  }
  const lng = Number(manualLng);
  const lat = Number(manualLat);
  if (isNaN(lng) || isNaN(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  if (lng === 0 && lat === 0) return null;
  return [lng, lat];
}

// Helper to determine proper browser-accessible image URL
function getImageUrl(file) {
  if (!file) return null;
  if (file.path && (file.path.startsWith("http://") || file.path.startsWith("https://"))) {
    return file.path;
  }
  const filename = file.filename || path.basename(file.path);
  return `/uploads/${filename}`;
}

// Render Admin Login Form
module.exports.renderLoginForm = (req, res) => {
  if (req.isAuthenticated() && req.user.role === "admin" && req.session.admin2FAVerified) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin/login.ejs", {
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
  });
};

// Admin Step 1 Login Post Handler (Password & Turnstile Verification)
module.exports.login = async (req, res) => {
  const { username, password } = req.body;
  const turnstileToken = req.body["cf-turnstile-response"];

  // Verify Cloudflare Turnstile challenge if configured
  const turnstileResult = await verifyTurnstile(turnstileToken, req.ip);
  if (!turnstileResult.success) {
    req.flash("error", turnstileResult.error);
    return res.redirect("/admin/login");
  }

  const clean = String(username || "").trim();
  if (!clean || !password) {
    req.flash("error", "Admin identifier and password are required.");
    return res.redirect("/admin/login");
  }

  const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const user = await User.findOne({
    $or: [
      { email: clean.toLowerCase() },
      { mobile: clean },
      { username: new RegExp("^" + escapeRegex(clean) + "$", "i") },
    ],
  });

  if (!user || user.role !== "admin") {
    req.flash("error", "Invalid administrator credentials.");
    return res.redirect("/admin/login");
  }

  const authResult = await user.authenticate(password);
  if (authResult.error || !authResult.user) {
    req.flash("error", "Invalid administrator credentials.");
    return res.redirect("/admin/login");
  }

  // Password verification succeeded! Stage pending 2FA state
  req.session.adminPending2FA = {
    userId: user._id.toString(),
    expiresAt: Date.now() + 10 * 60 * 1000,
    enrolled: !!(user.twoFactor && user.twoFactor.enabled),
  };

  if (user.twoFactor && user.twoFactor.enabled) {
    return res.redirect("/admin/verify-2fa");
  } else {
    req.flash("warning", "Two-factor authentication setup is required before accessing the admin dashboard.");
    return res.redirect("/admin/setup-2fa");
  }
};

// Render 2FA Verification Form
module.exports.renderVerify2FA = (req, res) => {
  const pending = req.session.adminPending2FA;
  if (!pending || Date.now() > pending.expiresAt) {
    delete req.session.adminPending2FA;
    req.flash("error", "Verification session expired. Please sign in again.");
    return res.redirect("/admin/login");
  }
  res.render("admin/verify2fa.ejs");
};

// Verify 2FA TOTP Code or Recovery Code
module.exports.verify2FA = async (req, res) => {
  const pending = req.session.adminPending2FA;
  if (!pending || Date.now() > pending.expiresAt) {
    delete req.session.adminPending2FA;
    req.flash("error", "Verification session expired. Please sign in again.");
    return res.redirect("/admin/login");
  }

  const { totpCode, recoveryCode } = req.body;
  const user = await User.findById(pending.userId);
  if (!user || user.role !== "admin") {
    delete req.session.adminPending2FA;
    req.flash("error", "User not found or unauthorized.");
    return res.redirect("/admin/login");
  }

  if (totpCode && totpCode.trim()) {
    const plainSecret = decryptSecret(user.twoFactor.secret);
    if (!plainSecret) {
      req.flash("error", "Security configuration error. Please re-enroll 2FA.");
      return res.redirect("/admin/login");
    }

    const isValid = verifyTOTP(totpCode.trim(), plainSecret);
    if (!isValid) {
      req.flash("error", "Invalid 6-digit authenticator code. Please check your app clock and try again.");
      return res.redirect("/admin/verify-2fa");
    }
  } else if (recoveryCode && recoveryCode.trim()) {
    const matchedIdx = findAndValidateRecoveryCode(recoveryCode, user.twoFactor.recoveryCodes);
    if (matchedIdx === -1) {
      req.flash("error", "Invalid or already used recovery code.");
      return res.redirect("/admin/verify-2fa");
    }
    user.twoFactor.recoveryCodes[matchedIdx].used = true;
    user.twoFactor.recoveryCodes[matchedIdx].usedAt = new Date();
    await user.save();
    req.flash("warning", "Signed in using a single-use recovery code. Please keep remaining codes safe.");
  } else {
    req.flash("error", "Please provide a 6-digit authenticator code or backup recovery code.");
    return res.redirect("/admin/verify-2fa");
  }

  // 2FA Verified! Establish Passport session & set admin2FAVerified
  delete req.session.adminPending2FA;
  req.login(user, (err) => {
    if (err) {
      req.flash("error", "Session initialization error.");
      return res.redirect("/admin/login");
    }
    req.session.admin2FAVerified = true;
    req.flash("success", `Welcome back to Admin Console, ${user.fullName || user.username}!`);
    let redirectUrl = res.locals.redirectUrl || "/admin/dashboard";
    if (redirectUrl.includes("/login") || redirectUrl.includes("/signup") || redirectUrl.includes("/2fa")) {
      redirectUrl = "/admin/dashboard";
    }
    if (req.session.redirectUrl) {
      delete req.session.redirectUrl;
    }
    res.redirect(redirectUrl);
  });
};

// Render 2FA Setup / Enrollment Form
module.exports.renderSetup2FA = async (req, res) => {
  const pending = req.session.adminPending2FA;
  if (!pending || Date.now() > pending.expiresAt) {
    delete req.session.adminPending2FA;
    req.flash("error", "Setup session expired. Please sign in again.");
    return res.redirect("/admin/login");
  }

  const user = await User.findById(pending.userId);
  if (!user || user.role !== "admin") {
    delete req.session.adminPending2FA;
    req.flash("error", "Unauthorized access.");
    return res.redirect("/admin/login");
  }

  if (user.twoFactor && user.twoFactor.enabled) {
    return res.redirect("/admin/verify-2fa");
  }

  // Generate fresh Base32 secret & persist encrypted in tempSecret
  const plainSecret = createSecret();
  user.twoFactor = user.twoFactor || {};
  user.twoFactor.tempSecret = encryptSecret(plainSecret);
  await user.save();

  const otpUri = generateTOTPUri(user.email, plainSecret);
  const qrDataUrl = await generateQRCodeDataURL(otpUri);

  res.render("admin/setup2fa.ejs", {
    qrDataUrl,
    secret: plainSecret,
    user,
  });
};

// Confirm 2FA Setup with 6-digit code and generate recovery codes
module.exports.setup2FA = async (req, res) => {
  const pending = req.session.adminPending2FA;
  if (!pending || Date.now() > pending.expiresAt) {
    delete req.session.adminPending2FA;
    req.flash("error", "Setup session expired. Please sign in again.");
    return res.redirect("/admin/login");
  }

  const { totpCode } = req.body;
  const user = await User.findById(pending.userId);
  if (!user || user.role !== "admin") {
    delete req.session.adminPending2FA;
    req.flash("error", "Unauthorized access.");
    return res.redirect("/admin/login");
  }

  if (!user.twoFactor || !user.twoFactor.tempSecret) {
    req.flash("error", "Setup session expired. Please re-open the setup page.");
    return res.redirect("/admin/setup-2fa");
  }

  const plainSecret = decryptSecret(user.twoFactor.tempSecret);
  const isValid = verifyTOTP(totpCode, plainSecret);

  if (!isValid) {
    req.flash("error", "Verification failed. The 6-digit code does not match. Please verify your app's time and re-enter.");
    return res.redirect("/admin/setup-2fa");
  }

  // Code verified! Generate 8 recovery codes
  const generatedCodes = generateRecoveryCodes(8);
  user.twoFactor.secret = user.twoFactor.tempSecret;
  user.twoFactor.tempSecret = null;
  user.twoFactor.enabled = true;
  user.twoFactor.enrolledAt = new Date();
  user.twoFactor.recoveryCodes = generatedCodes.map((c) => ({
    codeHash: c.codeHash,
    used: false,
    usedAt: null,
  }));
  await user.save();

  // Clear pending, establish session, and display recovery codes once
  delete req.session.adminPending2FA;
  req.login(user, (err) => {
    if (err) {
      req.flash("error", "Session initialization error.");
      return res.redirect("/admin/login");
    }
    req.session.admin2FAVerified = true;
    req.session.newRecoveryCodes = generatedCodes.map((c) => c.plain);
    res.redirect("/admin/recovery-codes");
  });
};

// Render One-Time Recovery Codes Display Page
module.exports.renderRecoveryCodes = (req, res) => {
  if (!req.session.admin2FAVerified || !req.session.newRecoveryCodes) {
    return res.redirect("/admin/dashboard");
  }
  const recoveryCodes = req.session.newRecoveryCodes;
  // Delete from session so they are not retained once viewed
  delete req.session.newRecoveryCodes;
  res.render("admin/recoveryCodes.ejs", { recoveryCodes });
};

// Admin Invalidate Session & Logout
module.exports.logout = (req, res) => {
  req.logout((err) => {
    if (req.session) {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/admin/login");
      });
    } else {
      res.redirect("/admin/login");
    }
  });
};

// Admin Dashboard Overview
module.exports.dashboard = async (req, res) => {
  await autoUpdateCompletedBookings();

  const [
    totalListings,
    pendingListings,
    approvedListings,
    publishedListings,
    totalUsers,
    totalBookings,
    pendingBookings,
    confirmedBookings,
    completedBookings,
    rejectedBookings,
    cancelledBookings,
    totalReviews,
    recentBookings,
    recentListings,
  ] = await Promise.all([
    Listing.countDocuments(),
    Listing.countDocuments({ status: "pending" }),
    Listing.countDocuments({ status: "approved" }),
    Listing.countDocuments({ isPublished: true, status: "approved" }),
    User.countDocuments(),
    Booking.countDocuments(),
    Booking.countDocuments({ status: "Pending" }),
    Booking.countDocuments({ status: "Confirmed" }),
    Booking.countDocuments({ status: "Completed" }),
    Booking.countDocuments({ status: "Rejected" }),
    Booking.countDocuments({ status: "Cancelled" }),
    Review.countDocuments(),
    Booking.find()
      .populate("listing", "title location image images")
      .populate("user", "username email fullName")
      .sort({ createdAt: -1 })
      .limit(6),
    Listing.find().populate("owner", "username email fullName").sort({ createdAt: -1 }).limit(5),
  ]);

  // Distinct host count (either role="host" or has listed property)
  const listingOwners = await Listing.distinct("owner");
  const totalHosts = await User.countDocuments({
    $or: [{ role: "host" }, { _id: { $in: listingOwners } }],
  });

  // Calculate gross booking volume from confirmed and completed stays
  const revenueAgg = await Booking.aggregate([
    { $match: { status: { $in: ["Confirmed", "Completed"] } } },
    { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } },
  ]);
  const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;

  res.render("admin/dashboard.ejs", {
    stats: {
      totalListings,
      pendingListings,
      approvedListings,
      publishedListings,
      totalUsers,
      totalHosts,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      rejectedBookings,
      cancelledBookings,
      totalReviews,
      totalRevenue,
    },
    recentBookings,
    recentListings,
  });
};

// Admin Listings Management
module.exports.listListings = async (req, res) => {
  const { search, category, status } = req.query;
  const filter = {};

  if (search) {
    filter.$or = [
      { title: { $regex: search.trim(), $options: "i" } },
      { location: { $regex: search.trim(), $options: "i" } },
      { country: { $regex: search.trim(), $options: "i" } },
    ];
  }

  if (category && category !== "All") {
    filter.category = category;
  }

  if (status === "pending") {
    filter.status = "pending";
  } else if (status === "approved") {
    filter.status = "approved";
  } else if (status === "rejected") {
    filter.status = "rejected";
  } else if (status === "published") {
    filter.isPublished = true;
  } else if (status === "unpublished") {
    filter.isPublished = false;
  }

  const listings = await Listing.find(filter)
    .populate("owner", "username email role")
    .sort({ createdAt: -1 });

  res.render("admin/listings.ejs", {
    listings,
    search: search || "",
    category: category || "All",
    status: status || "all",
  });
};

// Render Admin New Listing Form
module.exports.renderNewListingForm = (req, res) => {
  res.render("admin/newListing.ejs", { mapToken: process.env.MAP_TOKEN || "" });
};

// Admin Create Listing
module.exports.createListing = async (req, res) => {
  const listingData = req.body.listing;

  // Handle coordinates from geocoding or manual input
  let geometry = { type: "Point", coordinates: [] };
  let isLocationResolved = false;
  let locationResolutionNotes = "";

  const manualCoords = parseAndValidateCoordinates(listingData.longitude, listingData.latitude);

  if (manualCoords) {
    geometry = { type: "Point", coordinates: manualCoords };
    isLocationResolved = true;
    locationResolutionNotes = `Admin manual coordinates: [${manualCoords[0]}, ${manualCoords[1]}].`;
  } else if (geocodingClient && listingData.location) {
    try {
      const geoRes = await geocodingClient
        .forwardGeocode({
          query: `${listingData.location}, ${listingData.country || "India"}`,
          limit: 1,
        })
        .send();
      if (geoRes && geoRes.body && geoRes.body.features && geoRes.body.features.length > 0) {
        geometry = geoRes.body.features[0].geometry;
        isLocationResolved = true;
        locationResolutionNotes = `Admin geocoded: ${listingData.location}.`;
      } else {
        geometry = { type: "Point", coordinates: [] };
        isLocationResolved = false;
        locationResolutionNotes = `Geocoding yielded no results for "${listingData.location}".`;
      }
    } catch (err) {
      console.warn("Geocoding failed on admin create:", err.message);
      geometry = { type: "Point", coordinates: [] };
      isLocationResolved = false;
      locationResolutionNotes = `Geocoding failed: ${err.message}`;
    }
  } else {
    geometry = { type: "Point", coordinates: [] };
    isLocationResolved = false;
    locationResolutionNotes = "No coordinates or location provided.";
  }

  // Multi-image and single-image upload support
  let images = [];
  if (req.files && req.files.length > 0) {
    images = req.files.map((f) => ({
      url: getImageUrl(f),
      filename: f.filename || "listingimage",
    }));
  } else if (req.file) {
    images = [
      {
        url: getImageUrl(req.file),
        filename: req.file.filename || "listingimage",
      },
    ];
  } else if (listingData.imageUrl && listingData.imageUrl.trim()) {
    images = [
      {
        url: listingData.imageUrl.trim(),
        filename: "custom-url",
      },
    ];
  } else {
    images = [
      {
        url: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=800&q=60",
        filename: "default-listing",
      },
    ];
  }

  const image = images[0];

  // Handle amenities
  let amenities = [];
  if (req.body.amenities) {
    amenities = Array.isArray(req.body.amenities) ? req.body.amenities : [req.body.amenities];
  }

  let isPub = req.body.isPublished === "on" || req.body.isPublished === true || req.body.isPublished === "true";

  // Prevent publication if location unresolved
  if (!isLocationResolved || !geometry.coordinates || geometry.coordinates.length < 2) {
    isPub = false;
  }

  const newListing = new Listing({
    ...listingData,
    image,
    images,
    geometry,
    isLocationResolved,
    locationResolutionNotes,
    amenities,
    status: isPub ? "approved" : "draft",
    isPublished: isPub,
    featured: req.body.featured === "on" || req.body.featured === true,
    owner: req.user._id,
  });

  await newListing.save();

  if (!isLocationResolved) {
    req.flash("warning", `Listing "${newListing.title}" created as draft because location coordinates could not be resolved.`);
  } else {
    req.flash("success", `Listing "${newListing.title}" created successfully!`);
  }
  res.redirect("/admin/listings");
};

// Render Admin Edit Listing Form
module.exports.renderEditListingForm = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/admin/listings");
  }
  res.render("admin/editListing.ejs", { listing, mapToken: process.env.MAP_TOKEN || "" });
};

// Admin Update Listing
module.exports.updateListing = async (req, res) => {
  const { id } = req.params;
  const listingData = req.body.listing;

  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/admin/listings");
  }

  // Handle amenities
  let amenities = [];
  if (req.body.amenities) {
    amenities = Array.isArray(req.body.amenities) ? req.body.amenities : [req.body.amenities];
  }

  // Handle coordinates
  const manualCoords = parseAndValidateCoordinates(listingData.longitude, listingData.latitude);
  if (manualCoords) {
    listing.geometry = { type: "Point", coordinates: manualCoords };
    listing.isLocationResolved = true;
    listing.locationResolutionNotes = `Admin manual coordinates: [${manualCoords[0]}, ${manualCoords[1]}].`;
  } else if (geocodingClient && listingData.location && listingData.location !== listing.location) {
    try {
      const geoRes = await geocodingClient
        .forwardGeocode({
          query: `${listingData.location}, ${listingData.country || "India"}`,
          limit: 1,
        })
        .send();
      if (geoRes && geoRes.body && geoRes.body.features && geoRes.body.features.length > 0) {
        listing.geometry = geoRes.body.features[0].geometry;
        listing.isLocationResolved = true;
        listing.locationResolutionNotes = `Admin re-geocoded: ${listingData.location}.`;
      } else {
        listing.geometry = { type: "Point", coordinates: [] };
        listing.isLocationResolved = false;
        listing.locationResolutionNotes = `Geocoding yielded no results for "${listingData.location}".`;
      }
    } catch (err) {
      console.warn("Geocoding update fallback:", err.message);
      listing.geometry = { type: "Point", coordinates: [] };
      listing.isLocationResolved = false;
      listing.locationResolutionNotes = `Geocoding failed: ${err.message}`;
    }
  }

  // Handle image upload or image URL
  if (req.files && req.files.length > 0) {
    const newImages = req.files.map((f) => ({
      url: getImageUrl(f),
      filename: f.filename || "listingimage",
    }));
    listing.image = newImages[0];
    listing.images = newImages;
  } else if (req.file) {
    const singleImage = { url: getImageUrl(req.file), filename: req.file.filename || "listingimage" };
    listing.image = singleImage;
    if (!listing.images || listing.images.length === 0) listing.images = [singleImage];
    else listing.images[0] = singleImage;
  } else if (listingData.imageUrl && listingData.imageUrl.trim()) {
    const customImage = { url: listingData.imageUrl.trim(), filename: "custom-url" };
    listing.image = customImage;
    listing.images = [customImage];
  }

  listing.title = listingData.title;
  listing.description = listingData.description;
  listing.price = Number(listingData.price);
  listing.location = listingData.location;
  listing.country = listingData.country;
  listing.category = listingData.category;
  listing.propertyType = listingData.propertyType || "Apartment";
  listing.maxGuests = Number(listingData.maxGuests) || 2;
  listing.bedrooms = Number(listingData.bedrooms) || 1;
  listing.beds = Number(listingData.beds) || 1;
  listing.bathrooms = Number(listingData.bathrooms) || 1;
  listing.amenities = amenities;
  listing.isPublished = req.body.isPublished === "on" || req.body.isPublished === true;
  listing.featured = req.body.featured === "on" || req.body.featured === true;

  // Prevent publication if location unresolved
  if (!listing.isLocationResolved || !listing.geometry || !listing.geometry.coordinates || listing.geometry.coordinates.length < 2) {
    listing.isPublished = false;
    if (listing.status === "approved") {
      listing.status = "draft";
    }
  }

  if (listing.isPublished) {
    listing.status = "approved";
  }

  await listing.save();
  req.flash("success", `Listing "${listing.title}" updated successfully.`);
  res.redirect("/admin/listings");
};

// Admin Approve Submitted Listing
module.exports.approveListing = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/admin/listings");
  }

  // Prevent approval/publishing if coordinates unresolved
  if (
    listing.isLocationResolved === false ||
    !listing.geometry ||
    !listing.geometry.coordinates ||
    listing.geometry.coordinates.length < 2
  ) {
    req.flash(
      "error",
      `Cannot approve "${listing.title}": Location coordinates are unresolved. Please edit the listing and pinpoint coordinates on the map before approving.`
    );
    return res.redirect("/admin/listings");
  }

  listing.status = "approved";
  listing.isPublished = true;
  listing.rejectionReason = "";
  await listing.save();

  req.flash("success", `Listing "${listing.title}" approved and published to public marketplace!`);
  res.redirect("/admin/listings");
};

// Admin Reject Submitted Listing
module.exports.rejectListing = async (req, res) => {
  const { id } = req.params;
  const { rejectionReason = "" } = req.body;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/admin/listings");
  }

  listing.status = "rejected";
  listing.isPublished = false;
  listing.rejectionReason = rejectionReason.trim() || "Does not meet listing standards or safety guidelines.";
  await listing.save();

  req.flash("info", `Listing "${listing.title}" has been rejected.`);
  res.redirect("/admin/listings");
};

// Admin Toggle Publish Status
module.exports.togglePublish = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/admin/listings");
  }

  // If currently hidden and trying to publish, check location resolution
  if (
    !listing.isPublished &&
    (listing.isLocationResolved === false ||
      !listing.geometry ||
      !listing.geometry.coordinates ||
      listing.geometry.coordinates.length < 2)
  ) {
    req.flash(
      "error",
      `Cannot publish "${listing.title}": Location coordinates are unresolved. Please edit and assign valid coordinates first.`
    );
    return res.redirect("/admin/listings");
  }

  listing.isPublished = !listing.isPublished;
  await listing.save();

  req.flash(
    "success",
    `Listing "${listing.title}" is now ${listing.isPublished ? "Published (Visible on site)" : "Unpublished (Hidden from public)"}.`
  );
  res.redirect("/admin/listings");
};

// Admin Delete Listing (Safe handling of existing bookings)
module.exports.deleteListing = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/admin/listings");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check for active confirmed bookings in the future
  const activeBookings = await Booking.countDocuments({
    listing: id,
    status: "Confirmed",
    checkOut: { $gte: today },
  });

  if (activeBookings > 0) {
    req.flash(
      "error",
      `Cannot delete listing "${listing.title}": There are ${activeBookings} active confirmed booking(s). Unpublish the property instead to prevent disrupting booked guests.`
    );
    return res.redirect("/admin/listings");
  }

  await Listing.findByIdAndDelete(id);
  req.flash("success", `Listing "${listing.title}" and its reviews were safely deleted.`);
  res.redirect("/admin/listings");
};

// Admin Bookings Management
module.exports.listBookings = async (req, res) => {
  await autoUpdateCompletedBookings();
  const { status, search } = req.query;
  const filter = {};

  if (status && status !== "all") {
    filter.status = status;
  }

  if (search && search.trim()) {
    filter.$or = [
      { bookingRef: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const bookings = await Booking.find(filter)
    .populate("listing", "title location price image images")
    .populate("user", "username email fullName mobile")
    .populate("reviewedBy", "username")
    .sort({ createdAt: -1 });

  res.render("admin/bookings.ejs", {
    bookings,
    status: status || "all",
    search: search || "",
  });
};

// Admin Approve Booking
module.exports.approveBooking = async (req, res) => {
  const { id } = req.params;
  const booking = await Booking.findById(id).populate("listing");

  if (!booking) {
    req.flash("error", "Booking request not found!");
    return res.redirect("/admin/bookings");
  }

  // Revalidate availability on server to prevent concurrent conflicts
  const conflict = await Booking.findOne({
    _id: { $ne: booking._id },
    listing: booking.listing._id,
    status: "Confirmed",
    $or: [
      { checkIn: { $lt: booking.checkOut, $gte: booking.checkIn } },
      { checkOut: { $gt: booking.checkIn, $lte: booking.checkOut } },
      { checkIn: { $lte: booking.checkIn }, checkOut: { $gte: booking.checkOut } },
    ],
  });

  if (conflict) {
    req.flash(
      "error",
      `Conflict detected! Dates overlap with existing confirmed booking #${conflict.bookingRef}. Cannot approve.`
    );
    return res.redirect("/admin/bookings");
  }

  booking.status = "Confirmed";
  booking.reviewedBy = req.user._id;
  booking.reviewedAt = new Date();
  await booking.save();

  req.flash("success", `Booking #${booking.bookingRef} has been approved and confirmed.`);
  res.redirect("/admin/bookings");
};

// Admin Reject Booking
module.exports.rejectBooking = async (req, res) => {
  const { id } = req.params;
  const { rejectionReason = "" } = req.body;
  const booking = await Booking.findById(id);

  if (!booking) {
    req.flash("error", "Booking request not found!");
    return res.redirect("/admin/bookings");
  }

  booking.status = "Rejected";
  booking.rejectionReason = rejectionReason.trim() || "Property unavailable for selected dates";
  booking.reviewedBy = req.user._id;
  booking.reviewedAt = new Date();
  await booking.save();

  req.flash("success", `Booking #${booking.bookingRef} has been rejected.`);
  res.redirect("/admin/bookings");
};

// Admin Users Management
module.exports.listUsers = async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });

  // Get booking counts for each user
  const userBookingCounts = await Booking.aggregate([
    { $group: { _id: "$user", count: { $sum: 1 } } },
  ]);
  const bookingCountMap = {};
  userBookingCounts.forEach((b) => {
    bookingCountMap[b._id.toString()] = b.count;
  });

  res.render("admin/users.ejs", { users, bookingCountMap });
};

// Admin Toggle User Role
module.exports.toggleUserRole = async (req, res) => {
  const { id } = req.params;
  const targetUser = await User.findById(id);

  if (!targetUser) {
    req.flash("error", "User not found!");
    return res.redirect("/admin/users");
  }

  // Prevent admin from demoting themselves
  if (targetUser._id.equals(req.user._id)) {
    req.flash("error", "Security restriction: You cannot revoke your own administrator role!");
    return res.redirect("/admin/users");
  }

  // Prevent demoting the last administrator
  if (targetUser.role === "admin") {
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      req.flash("error", "Security restriction: Cannot demote the last remaining administrator.");
      return res.redirect("/admin/users");
    }
  }

  targetUser.role = targetUser.role === "admin" ? "user" : "admin";
  await targetUser.save();

  req.flash(
    "success",
    `Role for @${targetUser.username} (${targetUser.email}) updated to "${targetUser.role.toUpperCase()}".`
  );
  res.redirect("/admin/users");
};

// Admin Hosts Management
module.exports.listHosts = async (req, res) => {
  const listingOwners = await Listing.distinct("owner");
  const hosts = await User.find({
    $or: [{ role: "host" }, { _id: { $in: listingOwners } }],
  }).sort({ createdAt: -1 });

  const hostStats = await Promise.all(
    hosts.map(async (host) => {
      const listingCount = await Listing.countDocuments({ owner: host._id });
      const hostListings = await Listing.find({ owner: host._id }, "_id");
      const listingIds = hostListings.map((l) => l._id);
      const bookingsCount = await Booking.countDocuments({ listing: { $in: listingIds } });
      return {
        host,
        listingCount,
        bookingsCount,
      };
    })
  );

  res.render("admin/hosts.ejs", { hostStats });
};

// Admin Reviews Moderation
module.exports.listReviews = async (req, res) => {
  const reviews = await Review.find()
    .populate("listing", "title location image images")
    .populate("author", "username email fullName")
    .sort({ createdAt: -1 });

  res.render("admin/reviews.ejs", { reviews });
};

module.exports.deleteReview = async (req, res) => {
  const { id } = req.params;
  const review = await Review.findById(id);
  if (!review) {
    req.flash("error", "Review not found!");
    return res.redirect("/admin/reviews");
  }

  if (review.listing) {
    await Listing.findByIdAndUpdate(review.listing, { $pull: { reviews: review._id } });
  }
  if (review.booking) {
    await Booking.findByIdAndUpdate(review.booking, { hasReviewed: false });
  }

  await Review.findByIdAndDelete(id);
  req.flash("success", "Review successfully removed by administrator.");
  res.redirect("/admin/reviews");
};

// Location Integrity Dashboard (Phase 9.3)
module.exports.locationIntegrityDashboard = async (req, res) => {
  const listings = await Listing.find().populate("owner", "username email fullName").sort({ updatedAt: -1 });

  let verifiedCount = 0;
  let unresolvedCount = 0;
  let reviewNeededCount = 0;

  const analyzedListings = listings.map((l) => {
    const coords = l.geometry && l.geometry.coordinates;
    const hasValidCoords =
      Array.isArray(coords) &&
      coords.length === 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number" &&
      !isNaN(coords[0]) &&
      !isNaN(coords[1]) &&
      coords[0] >= -180 &&
      coords[0] <= 180 &&
      coords[1] >= -90 &&
      coords[1] <= 90;

    const isLegacyMumbai =
      hasValidCoords &&
      Math.abs(coords[0] - 72.8777) < 0.01 &&
      Math.abs(coords[1] - 19.076) < 0.01 &&
      !((l.location || "").toLowerCase().includes("mumbai") ||
        (l.location || "").toLowerCase().includes("bombay"));

    let locationStatus = "verified";
    let statusLabel = "Verified";
    let badgeClass = "bg-success";

    if (!hasValidCoords || l.isLocationResolved === false) {
      locationStatus = "unresolved";
      statusLabel = "Unresolved";
      badgeClass = "bg-danger";
      unresolvedCount++;
    } else if (isLegacyMumbai) {
      locationStatus = "review_needed";
      statusLabel = "Requires Review";
      badgeClass = "bg-warning text-dark";
      reviewNeededCount++;
    } else {
      verifiedCount++;
    }

    return {
      ...l.toObject(),
      hasValidCoords,
      isLegacyMumbai,
      locationStatus,
      statusLabel,
      badgeClass,
      formattedCoordinates: hasValidCoords ? `[${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}]` : "Not Set",
    };
  });

  // Audit Referential Integrity across collections
  const allUserDocs = await User.find().select("_id").lean();
  const allUserIds = new Set(allUserDocs.map((u) => u._id.toString()));
  const allListingIds = new Set(listings.map((l) => l._id.toString()));

  const orphanedOwnersCount = listings.filter((l) => l.owner && !allUserIds.has(l.owner._id ? l.owner._id.toString() : l.owner.toString())).length;
  const allBookings = await Booking.find().select("user listing bookingRef").lean();
  const orphanedBookings = allBookings.filter((b) => (b.user && !allUserIds.has(b.user.toString())) || (b.listing && !allListingIds.has(b.listing.toString())));
  const allReviews = await Review.find().select("author listing").lean();
  const orphanedReviews = allReviews.filter((r) => (!r.author || !allUserIds.has(r.author.toString())) || (r.listing && !allListingIds.has(r.listing.toString())));
  const orphanedReferencesCount = orphanedOwnersCount + orphanedBookings.length + orphanedReviews.length;

  const filter = req.query.filter || "all";
  let filteredListings = analyzedListings;
  if (filter === "unresolved") {
    filteredListings = analyzedListings.filter((l) => l.locationStatus === "unresolved");
  } else if (filter === "review_needed") {
    filteredListings = analyzedListings.filter((l) => l.locationStatus === "review_needed");
  } else if (filter === "verified") {
    filteredListings = analyzedListings.filter((l) => l.locationStatus === "verified");
  }

  res.render("admin/locations.ejs", {
    listings: filteredListings,
    stats: {
      totalListings: listings.length,
      verifiedCount,
      unresolvedCount,
      reviewNeededCount,
      orphanedReferencesCount,
      orphanedOwnersCount,
      orphanedBookingsCount: orphanedBookings.length,
      orphanedReviewsCount: orphanedReviews.length,
    },
    currentFilter: filter,
    currentTab: "locations",
    mapToken: process.env.MAP_TOKEN || "",
  });
};

// Admin Manual Location Fix / Pin Adjustment (Phase 9.3 & 9.3.2)
module.exports.fixListingLocation = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);

  const returnTarget = req.body.returnTo === "remediation" ? "/admin/remediation" : "/admin/locations";

  if (!listing) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }
    req.flash("error", "Listing not found.");
    return res.redirect(returnTarget);
  }

  const { longitude, latitude, location, country, city, state, address, isPublished, remediationReason, reason } = req.body;
  const parsedCoords = parseAndValidateCoordinates(longitude, latitude);

  if (!parsedCoords) {
    const errorMsg = "Invalid coordinates: Longitude must be between -180 and 180, and Latitude between -90 and 90.";
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ success: false, message: errorMsg });
    }
    req.flash("error", errorMsg);
    return res.redirect(`${returnTarget}?highlight=${id}`);
  }

  const previousCoords =
    listing.geometry && Array.isArray(listing.geometry.coordinates)
      ? [...listing.geometry.coordinates]
      : [];
  const previousLocation = listing.location || "";
  const auditReason = (remediationReason || reason || "Admin verified location pin adjustment").trim();

  // Record audit history
  if (!listing.locationAuditHistory) {
    listing.locationAuditHistory = [];
  }
  listing.locationAuditHistory.push({
    previousCoordinates: previousCoords,
    newCoordinates: parsedCoords,
    previousLocation: previousLocation,
    newLocation: location && typeof location === "string" && location.trim() ? location.trim() : previousLocation,
    remediatedBy: req.user._id,
    adminUsername: req.user.username || "admin",
    remediationReason: auditReason,
    timestamp: new Date(),
  });

  listing.geometry = {
    type: "Point",
    coordinates: parsedCoords,
  };
  listing.isLocationResolved = true;
  listing.locationResolutionNotes = `Admin manual verification by ${req.user.username} on ${new Date().toISOString()}: ${auditReason}`;
  listing.remediationFlag = "RESOLVED_VERIFIED";
  listing.remediationReviewStatus = "RESOLVED";

  if (location && typeof location === "string" && location.trim()) listing.location = location.trim();
  if (country && typeof country === "string" && country.trim()) listing.country = country.trim();
  if (city !== undefined && typeof city === "string") listing.city = city.trim();
  if (state !== undefined && typeof state === "string") listing.state = state.trim();
  if (address !== undefined && typeof address === "string") listing.address = address.trim();

  if (isPublished !== undefined) {
    listing.isPublished = isPublished === "true" || isPublished === true || isPublished === "on";
  }

  await listing.save();

  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({
      success: true,
      message: "Location successfully updated, verified, and audited.",
      listing: {
        _id: listing._id,
        coordinates: listing.geometry.coordinates,
        location: listing.location,
        country: listing.country,
        isLocationResolved: listing.isLocationResolved,
        remediationFlag: listing.remediationFlag,
        remediationReviewStatus: listing.remediationReviewStatus,
        auditHistoryCount: listing.locationAuditHistory.length,
      },
    });
  }

  req.flash("success", `Location for "${listing.title}" successfully verified, updated, and recorded in audit history.`);
  res.redirect(returnTarget);
};

// Admin Remediation Queue (Phase 9.3.2)
module.exports.remediationQueue = async (req, res) => {
  const category = req.query.category || "all";
  const filter = { remediationFlag: { $ne: "NONE" } };

  if (category && category !== "all") {
    filter.remediationFlag = category;
  }

  const flaggedListings = await Listing.find(filter)
    .populate("owner", "username email fullName")
    .sort({ createdAt: -1 });

  // Get full breakdown for category tabs / KPIs
  const allRemediation = await Listing.find({ remediationFlag: { $ne: "NONE" } })
    .select("remediationFlag remediationReviewStatus");

  const stats = {
    totalQueue: allRemediation.length,
    locationUncertain: allRemediation.filter((l) => l.remediationFlag === "LOCATION_UNCERTAIN").length,
    genericRegionCentroid: allRemediation.filter((l) => l.remediationFlag === "GENERIC_REGION_CENTROID").length,
    titleLocationMismatch: allRemediation.filter((l) => l.remediationFlag === "TITLE_LOCATION_MISMATCH").length,
    testDataRequiresReview: allRemediation.filter((l) => l.remediationFlag === "TEST_DATA_REQUIRES_REVIEW").length,
    resolvedVerified: allRemediation.filter((l) => l.remediationFlag === "RESOLVED_VERIFIED").length,
    pendingReviewCount: allRemediation.filter((l) => l.remediationReviewStatus === "PENDING_ADMIN_REVIEW").length,
  };

  // Referential Integrity: Historical Booking & Legacy Review
  const historicalBooking = await Booking.findOne({ bookingRef: "WL-TEST4732" })
    .populate("listing", "title location country");

  let historicalGuestUser = null;
  if (historicalBooking && historicalBooking.user) {
    historicalGuestUser = await User.findById(historicalBooking.user);
  }

  const legacyReview = await Review.findById("6a73a4a9ea51345c3de0cca3")
    .populate("listing", "title location country");

  let legacyReviewAuthor = null;
  if (legacyReview && legacyReview.author) {
    legacyReviewAuthor = await User.findById(legacyReview.author);
  }

  res.render("admin/remediation.ejs", {
    listings: flaggedListings,
    stats,
    historicalBooking,
    historicalGuestUser,
    legacyReview,
    legacyReviewAuthor,
    currentCategory: category,
    currentTab: "remediation",
    mapToken: process.env.MAP_TOKEN || "",
  });
};

// Admin Update Remediation Review Status, Title & Address Mismatch (Phase 9.3.2 & 9.3.3)
module.exports.updateRemediationStatus = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);

  if (!listing) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }
    req.flash("error", "Listing not found.");
    return res.redirect("/admin/remediation");
  }

  const {
    remediationReviewStatus,
    remediationNotes,
    title,
    location,
    address,
    city,
    state,
    country,
    remediationReason,
    reason,
  } = req.body;

  const prevTitle = listing.title;
  const prevLoc = listing.location;
  const prevCoords = listing.geometry?.coordinates ? [...listing.geometry.coordinates] : [];

  let contentChanged = false;

  if (title && typeof title === "string" && title.trim() && title.trim() !== listing.title) {
    listing.title = title.trim();
    contentChanged = true;
  }
  if (location && typeof location === "string" && location.trim() && location.trim() !== listing.location) {
    listing.location = location.trim();
    contentChanged = true;
  }
  if (address !== undefined && typeof address === "string") {
    listing.address = address.trim();
  }
  if (city !== undefined && typeof city === "string") {
    listing.city = city.trim();
  }
  if (state !== undefined && typeof state === "string") {
    listing.state = state.trim();
  }
  if (country && typeof country === "string" && country.trim()) {
    listing.country = country.trim();
  }

  if (req.body.isPublished !== undefined) {
    const pub = req.body.isPublished === true || req.body.isPublished === "true";
    if (pub !== listing.isPublished) {
      listing.isPublished = pub;
      contentChanged = true;
    }
  }

  if (remediationReviewStatus) {
    listing.remediationReviewStatus = remediationReviewStatus;
    if (remediationReviewStatus === "RESOLVED") {
      listing.remediationFlag = "RESOLVED_VERIFIED";
    } else if (remediationReviewStatus === "EXEMPT_REGIONAL") {
      listing.remediationFlag = "GENERIC_REGION_CENTROID";
    }
  }

  if (remediationNotes !== undefined) {
    listing.remediationNotes = remediationNotes.trim();
  }

  // If title, location, or address was modified, record audit history
  if (contentChanged) {
    if (!listing.locationAuditHistory) {
      listing.locationAuditHistory = [];
    }
    const auditReason = (remediationReason || reason || "Admin title and address mismatch correction").trim();
    listing.locationAuditHistory.push({
      previousCoordinates: prevCoords,
      newCoordinates: prevCoords,
      previousLocation: prevLoc,
      newLocation: listing.location,
      previousTitle: prevTitle,
      newTitle: listing.title,
      remediatedBy: req.user._id,
      adminUsername: req.user.username || "admin",
      remediationReason: auditReason,
      timestamp: new Date(),
    });
  }

  await listing.save();

  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.json({
      success: true,
      message: "Remediation status and property details updated successfully",
      listing: {
        _id: listing._id,
        title: listing.title,
        location: listing.location,
        country: listing.country,
        remediationFlag: listing.remediationFlag,
        remediationReviewStatus: listing.remediationReviewStatus,
        auditHistoryCount: listing.locationAuditHistory ? listing.locationAuditHistory.length : 0,
      },
    });
  }

  req.flash("success", `Updated remediation review status and details for "${listing.title}".`);
  res.redirect("/admin/remediation");
};
