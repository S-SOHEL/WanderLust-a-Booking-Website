require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const Listing = require("../models/listing");
const User = require("../models/user");
const Booking = require("../models/booking");
const Review = require("../models/review");

const MONGO_URL =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust"
    : process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";

async function runBackup() {
  console.log("=== INITIATING WANDERLUST PRE-PHASE 9.3.2 BACKUP ===");
  await mongoose.connect(MONGO_URL);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "..", "backups", `backup_phase9_3_2_${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const listings = await Listing.find().lean();
  const users = await User.find().lean();
  const bookings = await Booking.find().lean();
  const reviews = await Review.find().lean();

  fs.writeFileSync(path.join(backupDir, "listings.json"), JSON.stringify(listings, null, 2), "utf8");
  fs.writeFileSync(path.join(backupDir, "users.json"), JSON.stringify(users, null, 2), "utf8");
  fs.writeFileSync(path.join(backupDir, "bookings.json"), JSON.stringify(bookings, null, 2), "utf8");
  fs.writeFileSync(path.join(backupDir, "reviews.json"), JSON.stringify(reviews, null, 2), "utf8");

  // Specific snapshot of the 13 flagged listings
  const flaggedIds = [
    "6a835b69ee9059e578bd85df",
    "6a835b69ee9059e578bd85e1",
    "6a835b69ee9059e578bd85e8",
    "6a835b69ee9059e578bd85ea",
    "6a835b69ee9059e578bd85ec",
    "6a835b69ee9059e578bd85ef",
    "6a835b69ee9059e578bd85f0",
    "6a835b69ee9059e578bd85f2",
    "6a835c4c9cc3be0fc7a52ba8",
    "6a848560cd5fe570c378cbaf",
    "6a84b612ae28b2bb0537a4a6",
    "6a848373728df9b85f59c2bc",
    "6a8485086210b402d2ab6c8e",
  ];

  const flaggedSnapshot = listings
    .filter((l) => flaggedIds.includes(l._id.toString()))
    .map((l) => ({
      _id: l._id,
      title: l.title,
      location: l.location,
      city: l.city || "",
      state: l.state || "",
      country: l.country,
      coordinates: l.geometry ? l.geometry.coordinates : null,
      isPublished: l.isPublished,
      status: l.status,
    }));

  fs.writeFileSync(
    path.join(backupDir, "flagged_13_pre_remediation.json"),
    JSON.stringify(flaggedSnapshot, null, 2),
    "utf8"
  );

  // Snapshot of historical booking and legacy review
  const historicalBooking = bookings.find((b) => b.bookingRef === "WL-TEST4732");
  const legacyReview = reviews.find((r) => r._id.toString() === "6a73a4a9ea51345c3de0cca3");

  const referentialIntegritySnapshot = {
    historicalBooking,
    legacyReview,
  };

  fs.writeFileSync(
    path.join(backupDir, "referential_integrity_pre_remediation.json"),
    JSON.stringify(referentialIntegritySnapshot, null, 2),
    "utf8"
  );

  console.log(`[Backup Success] Stored ${listings.length} listings, ${users.length} users, ${bookings.length} bookings, ${reviews.length} reviews.`);
  console.log(`[Backup Directory]: ${backupDir}`);
  console.log(`[Flagged 13 Listings Snapshot]: ${flaggedSnapshot.length} records saved.`);

  await mongoose.disconnect();
  return { backupDir, flaggedCount: flaggedSnapshot.length, totalListings: listings.length };
}

if (require.main === module) {
  runBackup().catch((err) => {
    console.error("Backup fatal error:", err);
    process.exit(1);
  });
}

module.exports = { runBackup };
