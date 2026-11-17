const path = require("path");
const mongoose = require("mongoose");
const Listing = require("../models/listing");
const User = require("../models/user");
const Booking = require("../models/booking");
const { autoUpdateCompletedBookings } = require("../utils/bookingLifecycle");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
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

// Public listings index with search, filters, and sorting
module.exports.index = async (req, res) => {
  const { category, location, q, minPrice, maxPrice, propertyType, guests, amenity, sort } = req.query;
  const andConditions = [];

  // Only show approved and published listings to public
  andConditions.push({
    isPublished: { $ne: false },
    status: { $nin: ["pending", "rejected", "draft"] },
  });

  // Category filter
  if (category && category !== "All") {
    if (category === "Trending") {
      andConditions.push({
        $or: [
          { category: "Trending" },
          { category: { $exists: false } },
          { category: null },
          { category: "" },
        ],
      });
    } else {
      andConditions.push({ category: category });
    }
  }

  // Location / Search query
  const searchTerm = (location || q || "").trim();
  if (searchTerm) {
    andConditions.push({
      $or: [
        { location: { $regex: searchTerm, $options: "i" } },
        { country: { $regex: searchTerm, $options: "i" } },
        { title: { $regex: searchTerm, $options: "i" } },
        { description: { $regex: searchTerm, $options: "i" } },
      ],
    });
  }

  // Price range filter
  if (minPrice && !isNaN(minPrice)) {
    andConditions.push({ price: { $gte: Number(minPrice) } });
  }
  if (maxPrice && !isNaN(maxPrice)) {
    andConditions.push({ price: { $lte: Number(maxPrice) } });
  }

  // Property type filter
  if (propertyType && propertyType !== "All") {
    andConditions.push({ propertyType: propertyType });
  }

  // Guest count capacity filter
  if (guests && !isNaN(guests)) {
    andConditions.push({ maxGuests: { $gte: Number(guests) } });
  }

  // Amenity filter
  if (amenity) {
    andConditions.push({ amenities: amenity });
  }

  const filter = andConditions.length > 0 ? { $and: andConditions } : {};

  // Sorting
  let sortOption = { createdAt: -1 }; // default newest
  if (sort === "price_asc") {
    sortOption = { price: 1 };
  } else if (sort === "price_desc") {
    sortOption = { price: -1 };
  } else if (sort === "popular") {
    sortOption = { "reviews.length": -1 };
  }

  const allListings = await Listing.find(filter).sort(sortOption);

  res.render("listings/index.ejs", {
    allListings,
    selectedCategory: category || "All",
    searchLocation: searchTerm,
    minPrice: minPrice || "",
    maxPrice: maxPrice || "",
    propertyType: propertyType || "All",
    guests: guests || "",
    currentSort: sort || "newest",
    amenity: amenity || "",
  });
};

// Dedicated search endpoint
module.exports.searchListings = async (req, res) => {
  const { location, q, dates, guests, minPrice, maxPrice, propertyType, sort } = req.query;
  const searchTerm = (location || q || "").trim();
  const andConditions = [
    { isPublished: { $ne: false }, status: { $nin: ["pending", "rejected", "draft"] } },
  ];

  if (searchTerm) {
    andConditions.push({
      $or: [
        { location: { $regex: searchTerm, $options: "i" } },
        { country: { $regex: searchTerm, $options: "i" } },
        { title: { $regex: searchTerm, $options: "i" } },
        { description: { $regex: searchTerm, $options: "i" } },
      ],
    });
  }

  if (guests && !isNaN(guests)) {
    andConditions.push({ maxGuests: { $gte: Number(guests) } });
  }
  if (minPrice && !isNaN(minPrice)) {
    andConditions.push({ price: { $gte: Number(minPrice) } });
  }
  if (maxPrice && !isNaN(maxPrice)) {
    andConditions.push({ price: { $lte: Number(maxPrice) } });
  }
  if (propertyType && propertyType !== "All") {
    andConditions.push({ propertyType });
  }

  const filter = andConditions.length > 0 ? { $and: andConditions } : {};

  let sortOption = { createdAt: -1 };
  if (sort === "price_asc") sortOption = { price: 1 };
  else if (sort === "price_desc") sortOption = { price: -1 };

  const allListings = await Listing.find(filter).sort(sortOption);

  res.render("listings/index.ejs", {
    allListings,
    selectedCategory: "All",
    searchLocation: searchTerm,
    searchDates: dates || "",
    searchGuests: guests || "",
    minPrice: minPrice || "",
    maxPrice: maxPrice || "",
    propertyType: propertyType || "All",
    guests: guests || "",
    currentSort: sort || "newest",
    amenity: "",
  });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs", { mapToken: process.env.MAP_TOKEN || "" });
};

module.exports.showListing = async (req, res) => {
  await autoUpdateCompletedBookings();
  const { id } = req.params;
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author",
        select: "username fullName profileImage",
      },
    })
    .populate("owner", "username fullName email role profileImage");

  if (!listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }

  // If listing is unpublished or not approved, only admin or owner can view it
  if (listing.isPublished === false || listing.status === "pending" || listing.status === "rejected") {
    const isOwner = req.user && listing.owner && listing.owner._id.equals(req.user._id);
    const isAdmin = req.user && req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      req.flash("error", "This listing is currently pending approval or not publicly available.");
      return res.redirect("/listings");
    }
  }

  let eligibleBooking = null;
  let hasAlreadyReviewed = false;
  let userHasNonCompletedBooking = false;

  if (req.user) {
    const isOwner = listing.owner && listing.owner._id.equals(req.user._id);
    if (!isOwner) {
      const userBookings = await Booking.find({ listing: listing._id, user: req.user._id });
      const completedUnreviewed = userBookings.find((b) => b.status === "Completed" && !b.hasReviewed);
      if (completedUnreviewed) {
        eligibleBooking = completedUnreviewed;
      } else if (userBookings.some((b) => b.status === "Completed" && b.hasReviewed)) {
        hasAlreadyReviewed = true;
      } else if (userBookings.length > 0) {
        userHasNonCompletedBooking = true;
      }
    }
  }

  let isSaved = false;
  if (req.user) {
    const freshUser = await User.findById(req.user._id);
    if (freshUser && Array.isArray(freshUser.savedListings)) {
      isSaved = freshUser.savedListings.some(
        (savedId) => savedId.toString() === listing._id.toString()
      );
    }
  }

  res.render("listings/show.ejs", {
    listing,
    mapToken: process.env.MAP_TOKEN || "",
    eligibleBooking,
    hasAlreadyReviewed,
    userHasNonCompletedBooking,
    isSaved,
  });
};

module.exports.createListing = async (req, res, next) => {
  // 1. Promote user to host if currently 'user'
  if (req.user && req.user.role === "user") {
    await User.findByIdAndUpdate(req.user._id, { role: "host" });
    req.user.role = "host";
  }

  // 2. Strict Role-Based Status:
  // Admin listings are immediately approved and published if location is resolved.
  // User/Host listings are always set to 'pending' and isPublished = false.
  const isAdminUser = req.user && req.user.role === "admin";
  let status = isAdminUser ? "approved" : "pending";
  let isPublished = isAdminUser ? true : false;

  let geometry = { type: "Point", coordinates: [] };
  let isLocationResolved = false;
  let locationResolutionNotes = "";

  // Check if manual coordinates were supplied
  const manualLng = req.body.listing?.longitude !== undefined ? req.body.listing.longitude : req.body.longitude;
  const manualLat = req.body.listing?.latitude !== undefined ? req.body.listing.latitude : req.body.latitude;
  const manualCoords = parseAndValidateCoordinates(manualLng, manualLat);

  if (manualCoords) {
    geometry = { type: "Point", coordinates: manualCoords };
    isLocationResolved = true;
    locationResolutionNotes = `Manually selected coordinates: [${manualCoords[0]}, ${manualCoords[1]}].`;
  } else if (geocodingClient && req.body.listing && req.body.listing.location) {
    try {
      const queryAddress = `${req.body.listing.location}, ${req.body.listing.country || "India"}`;
      const response = await geocodingClient
        .forwardGeocode({
          query: queryAddress,
          limit: 1,
        })
        .send();

      if (response && response.body && response.body.features && response.body.features.length > 0) {
        geometry = response.body.features[0].geometry;
        isLocationResolved = true;
        locationResolutionNotes = `Automatically geocoded from "${queryAddress}".`;
      } else {
        geometry = { type: "Point", coordinates: [] };
        isLocationResolved = false;
        locationResolutionNotes = `Geocoding yielded no results for "${queryAddress}".`;
      }
    } catch (err) {
      console.error("Geocoding failed on createListing:", err.message);
      geometry = { type: "Point", coordinates: [] };
      isLocationResolved = false;
      locationResolutionNotes = `Geocoding failed: ${err.message}`;
    }
  } else {
    geometry = { type: "Point", coordinates: [] };
    isLocationResolved = false;
    locationResolutionNotes = "No geocoding service available or empty location.";
  }

  // CRITICAL RULE: Prevent publication of listings with unresolved location data
  if (!isLocationResolved || !geometry.coordinates || geometry.coordinates.length < 2) {
    isPublished = false;
    status = "pending";
  }

  // 3. Multi-image and single-image upload support
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
  } else if (req.body.listing && req.body.listing.imageUrl && req.body.listing.imageUrl.trim()) {
    images = [
      {
        url: req.body.listing.imageUrl.trim(),
        filename: "custom-url",
      },
    ];
  } else {
    images = [
      {
        url: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=800&q=60",
        filename: "default-image",
      },
    ];
  }

  const primaryImage = images[0];

  let amenities = [];
  if (req.body.amenities) {
    amenities = Array.isArray(req.body.amenities) ? req.body.amenities : [req.body.amenities];
  }

  const listingPayload = { ...req.body.listing };
  delete listingPayload.status;
  delete listingPayload.isPublished;
  delete listingPayload.geometry;
  delete listingPayload.latitude;
  delete listingPayload.longitude;

  const newListing = new Listing({
    ...listingPayload,
    image: primaryImage,
    images: images,
    geometry,
    isLocationResolved,
    locationResolutionNotes,
    amenities,
    owner: req.user._id,
    status,
    isPublished,
  });

  const savedListing = await newListing.save();

  if (!isLocationResolved) {
    req.flash(
      "warning",
      `Listing "${savedListing.title}" was saved, but its location coordinates are unresolved. It will remain unpublished until verified.`
    );
  } else if (isAdminUser) {
    req.flash("success", `Listing "${savedListing.title}" created and published successfully!`);
  } else {
    req.flash(
      "success",
      `Listing "${savedListing.title}" submitted successfully for review! An administrator will review and publish it.`
    );
  }
  res.redirect(`/listings/${savedListing._id}`);
};

module.exports.renderEditForm = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }

  let originalImageUrl = "";
  if (listing.image && listing.image.url) {
    originalImageUrl = listing.image.url.replace("/upload", "/upload/w_250");
  }
  res.render("listings/edit.ejs", {
    listing,
    originalImageUrl,
    mapToken: process.env.MAP_TOKEN || "",
  });
};

module.exports.updateListing = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/listings");
  }

  const isAdminUser = req.user && req.user.role === "admin";

  let amenities = [];
  if (req.body.amenities) {
    amenities = Array.isArray(req.body.amenities) ? req.body.amenities : [req.body.amenities];
  }

  // Handle coordinates: Check manual coordinates first
  const manualLng = req.body.listing?.longitude !== undefined ? req.body.listing.longitude : req.body.longitude;
  const manualLat = req.body.listing?.latitude !== undefined ? req.body.listing.latitude : req.body.latitude;
  const manualCoords = parseAndValidateCoordinates(manualLng, manualLat);

  if (manualCoords) {
    listing.geometry = { type: "Point", coordinates: manualCoords };
    listing.isLocationResolved = true;
    listing.locationResolutionNotes = `Manually updated coordinates: [${manualCoords[0]}, ${manualCoords[1]}].`;
  } else if (geocodingClient && req.body.listing?.location && req.body.listing.location !== listing.location) {
    try {
      const queryAddress = `${req.body.listing.location}, ${req.body.listing.country || listing.country || "India"}`;
      const response = await geocodingClient
        .forwardGeocode({
          query: queryAddress,
          limit: 1,
        })
        .send();
      if (response && response.body && response.body.features && response.body.features.length > 0) {
        listing.geometry = response.body.features[0].geometry;
        listing.isLocationResolved = true;
        listing.locationResolutionNotes = `Automatically re-geocoded from "${queryAddress}".`;
      } else {
        listing.geometry = { type: "Point", coordinates: [] };
        listing.isLocationResolved = false;
        listing.locationResolutionNotes = `Geocoding yielded no results for "${queryAddress}".`;
      }
    } catch (err) {
      console.error("Geocoding failed on update:", err.message);
      listing.geometry = { type: "Point", coordinates: [] };
      listing.isLocationResolved = false;
      listing.locationResolutionNotes = `Geocoding failed: ${err.message}`;
    }
  }

  // Handle uploaded images
  if (req.files && req.files.length > 0) {
    const newImages = req.files.map((f) => ({
      url: getImageUrl(f),
      filename: f.filename || "listingimage",
    }));
    listing.image = newImages[0];
    listing.images = newImages;
  } else if (req.file) {
    const singleImg = {
      url: getImageUrl(req.file),
      filename: req.file.filename || "listingimage",
    };
    listing.image = singleImg;
    if (!listing.images || listing.images.length === 0) {
      listing.images = [singleImg];
    } else {
      listing.images[0] = singleImg;
    }
  } else if (req.body.listing && req.body.listing.imageUrl && req.body.listing.imageUrl.trim()) {
    const customImg = {
      url: req.body.listing.imageUrl.trim(),
      filename: "custom-url",
    };
    listing.image = customImg;
    listing.images = [customImg];
  }

  const updateData = { ...req.body.listing };
  delete updateData.status;
  delete updateData.isPublished;
  delete updateData.geometry;
  delete updateData.latitude;
  delete updateData.longitude;

  Object.assign(listing, updateData);
  if (req.body.amenities) {
    listing.amenities = amenities;
  }

  // Non-admins must go through re-review on update
  if (!isAdminUser) {
    listing.status = "pending";
    listing.isPublished = false;
  }

  // CRITICAL RULE: Prevent publication of listings with unresolved location data
  if (!listing.isLocationResolved || !listing.geometry || !listing.geometry.coordinates || listing.geometry.coordinates.length < 2) {
    listing.isPublished = false;
    if (listing.status === "approved") {
      listing.status = "pending";
    }
  }

  await listing.save();

  if (!listing.isLocationResolved) {
    req.flash(
      "warning",
      `Listing "${listing.title}" updated, but its location coordinates are unresolved. It will remain unpublished until verified.`
    );
  } else if (isAdminUser) {
    req.flash("success", `Listing "${listing.title}" updated successfully!`);
  } else {
    req.flash("info", `Listing "${listing.title}" updated and submitted for administrator review.`);
  }
  res.redirect(`/listings/${id}`);
};

module.exports.destroyListing = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/listings");
  }

  // Check if listing has active bookings
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const Booking = require("../models/booking.js");
  const activeBookings = await Booking.countDocuments({
    listing: id,
    status: "Confirmed",
    checkOut: { $gte: today },
  });

  if (activeBookings > 0) {
    req.flash(
      "error",
      `Cannot delete listing: There are ${activeBookings} active confirmed booking(s). Please unpublish it instead.`
    );
    return res.redirect(`/listings/${id}`);
  }

  await Listing.findByIdAndDelete(id);
  req.flash("success", "Listing deleted successfully!");
  res.redirect("/listings");
};

// Toggle Wishlist (Save / Unsave)
module.exports.toggleWishlist = async (req, res) => {
  const { id } = req.params;

  if (!req.user) {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(401).json({ success: false, message: "Please log in to save listings." });
    }
    req.flash("error", "You must be logged in to manage your wishlist.");
    return res.redirect("/login");
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format." });
    }
    req.flash("error", "Invalid listing ID.");
    return res.redirect("/listings");
  }

  const listing = await Listing.findById(id);
  if (!listing) {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(404).json({ success: false, message: "Listing not found." });
    }
    req.flash("error", "Listing not found.");
    return res.redirect("/listings");
  }

  // Check if listing is published and approved (or if current user is owner / admin)
  const isAdmin = req.user && req.user.role === "admin";
  const isOwner = listing.owner && listing.owner.equals(req.user._id);
  if (!isAdmin && !isOwner) {
    if (listing.isPublished === false || listing.status === "pending" || listing.status === "rejected") {
      if (req.xhr || req.headers.accept?.includes("json")) {
        return res.status(403).json({
          success: false,
          message: "Cannot save an unpublished or unavailable listing.",
        });
      }
      req.flash("error", "Cannot save an unpublished or unavailable listing.");
      return res.redirect("/listings");
    }
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    req.flash("error", "User not found.");
    return res.redirect("/login");
  }

  if (!Array.isArray(user.savedListings)) {
    user.savedListings = [];
  }

  const isAlreadySaved = user.savedListings.some(
    (savedId) => savedId.toString() === listing._id.toString()
  );

  let isSaved = false;
  if (isAlreadySaved) {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { savedListings: listing._id },
    });
    isSaved = false;
  } else {
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { savedListings: listing._id },
    });
    isSaved = true;
  }

  if (req.xhr || req.headers.accept?.includes("json")) {
    return res.json({
      success: true,
      isSaved,
      message: isSaved ? "Property added to your wishlist!" : "Property removed from your wishlist.",
    });
  }

  req.flash("success", isSaved ? "Property added to your wishlist!" : "Property removed from your wishlist.");
  res.redirect(`/listings/${listing._id}`);
};

// Remove from Wishlist (Unsave explicitly)
module.exports.removeFromWishlist = async (req, res) => {
  const { id } = req.params;

  if (!req.user) {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(401).json({ success: false, message: "Please log in to manage your wishlist." });
    }
    req.flash("error", "You must be logged in to manage your wishlist.");
    return res.redirect("/login");
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(400).json({ success: false, message: "Invalid listing ID format." });
    }
    req.flash("error", "Invalid listing ID.");
    return res.redirect("/profile");
  }

  await User.findByIdAndUpdate(req.user._id, {
    $pull: { savedListings: id },
  });

  if (req.xhr || req.headers.accept?.includes("json")) {
    return res.json({
      success: true,
      isSaved: false,
      message: "Property removed from your wishlist.",
    });
  }

  req.flash("success", "Property removed from your wishlist.");
  res.redirect("/profile#wishlist");
};
