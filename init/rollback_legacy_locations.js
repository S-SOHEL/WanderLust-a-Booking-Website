require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Listing = require("../models/listing");

const MONGO_URL =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust"
    : process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";

async function rollback() {
  console.log("=== INITIATING PHASE 9.3 ROLLBACK ===");
  await mongoose.connect(MONGO_URL);

  const beforeFile = path.join(__dirname, "..", "backups", "latest", "affected_29_before_state.json");
  if (!fs.existsSync(beforeFile)) {
    throw new Error(`Rollback file not found at: ${beforeFile}`);
  }

  const beforeRecords = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
  console.log(`Found ${beforeRecords.length} records in rollback snapshot.`);

  let restoredCount = 0;
  for (const rec of beforeRecords) {
    await Listing.findByIdAndUpdate(rec._id, {
      $set: {
        "geometry.coordinates": rec.coordinates,
        isLocationResolved: rec.isLocationResolved,
        locationResolutionNotes: rec.locationResolutionNotes,
      },
    });
    restoredCount++;
  }

  console.log(`[Rollback Complete] Successfully restored ${restoredCount} listings to their exact before-state coordinates.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  rollback().catch((err) => {
    console.error("Rollback fatal error:", err);
    process.exit(1);
  });
}

module.exports = { rollback };
