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

async function createBackup() {
  console.log("=== INITIATING WANDERLUST PRE-PHASE 9.3 BACKUP ===");
  await mongoose.connect(MONGO_URL);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "..", "backups", `backup_phase9_3_${timestamp}`);

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

  // Specifically record the 29 affected listings before-state
  const affected = listings.filter((l) => {
    const coords = l.geometry && l.geometry.coordinates;
    return (
      Array.isArray(coords) &&
      coords.length === 2 &&
      Math.abs(coords[0] - 72.8777) < 0.01 &&
      Math.abs(coords[1] - 19.076) < 0.01 &&
      !((l.location || "").toLowerCase().includes("mumbai") ||
        (l.location || "").toLowerCase().includes("bombay"))
    );
  });

  const beforeState = affected.map((l) => ({
    _id: l._id,
    title: l.title,
    location: l.location,
    city: l.city || "",
    state: l.state || "",
    country: l.country,
    coordinates: l.geometry ? l.geometry.coordinates : null,
    isLocationResolved: l.isLocationResolved,
    locationResolutionNotes: l.locationResolutionNotes || "",
    status: l.status,
    isPublished: l.isPublished,
  }));

  fs.writeFileSync(path.join(backupDir, "affected_29_before_state.json"), JSON.stringify(beforeState, null, 2), "utf8");

  // Also write to a stable latest backup directory for easy reference/rollback
  const latestDir = path.join(__dirname, "..", "backups", "latest");
  if (!fs.existsSync(latestDir)) {
    fs.mkdirSync(latestDir, { recursive: true });
  }
  fs.writeFileSync(path.join(latestDir, "listings.json"), JSON.stringify(listings, null, 2), "utf8");
  fs.writeFileSync(path.join(latestDir, "users.json"), JSON.stringify(users, null, 2), "utf8");
  fs.writeFileSync(path.join(latestDir, "bookings.json"), JSON.stringify(bookings, null, 2), "utf8");
  fs.writeFileSync(path.join(latestDir, "reviews.json"), JSON.stringify(reviews, null, 2), "utf8");
  fs.writeFileSync(path.join(latestDir, "affected_29_before_state.json"), JSON.stringify(beforeState, null, 2), "utf8");

  console.log(`[Backup Success] Stored ${listings.length} listings, ${users.length} users, ${bookings.length} bookings, ${reviews.length} reviews.`);
  console.log(`[Backup Directory]: ${backupDir}`);
  console.log(`[Affected Listings Recorded]: ${affected.length} listings in affected_29_before_state.json`);

  await mongoose.disconnect();
  return { backupDir, latestDir, affectedCount: affected.length };
}

if (require.main === module) {
  createBackup().catch((err) => {
    console.error("Backup fatal error:", err);
    process.exit(1);
  });
}

module.exports = { createBackup };
