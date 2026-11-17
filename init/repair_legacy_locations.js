require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");

const Listing = require("../models/listing");

const MONGO_URL =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust"
    : process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";

const mapToken = process.env.MAP_TOKEN;
if (!mapToken) {
  console.error("FATAL: MAP_TOKEN is missing in environment variables.");
  process.exit(1);
}
const geocodingClient = mbxGeocoding({ accessToken: mapToken });

const countryToIso = {
  "United States": "us",
  "Mexico": "mx",
  "Switzerland": "ch",
  "Tanzania": "tz",
  "Netherlands": "nl",
  "Fiji": "fj",
  "United Kingdom": "gb",
  "Indonesia": "id",
  "Canada": "ca",
  "Thailand": "th",
  "Greece": "gr",
  "Costa Rica": "cr",
  "Japan": "jp",
  "Maldives": "mv",
  "India": "in",
  "india": "in",
};

const bbox = {
  India: { minLng: 68, maxLng: 98, minLat: 6, maxLat: 38 },
  india: { minLng: 68, maxLng: 98, minLat: 6, maxLat: 38 },
  "United States": { minLng: -130, maxLng: -65, minLat: 20, maxLat: 50 },
  Italy: { minLng: 6, maxLng: 19, minLat: 35, maxLat: 48 },
  Mexico: { minLng: -118, maxLng: -86, minLat: 14, maxLat: 33 },
  Switzerland: { minLng: 5, maxLng: 11, minLat: 45, maxLat: 48 },
  Tanzania: { minLng: 29, maxLng: 41, minLat: -12, maxLat: -1 },
  Netherlands: { minLng: 3, maxLng: 8, minLat: 50, maxLat: 54 },
  Fiji: { minLng: 175, maxLng: 180, minLat: -22, maxLat: -12 },
  "United Kingdom": { minLng: -9, maxLng: 3, minLat: 49, maxLat: 61 },
  Indonesia: { minLng: 95, maxLng: 141, minLat: -11, maxLat: 7 },
  Canada: { minLng: -141, maxLng: -52, minLat: 41, maxLat: 84 },
  Thailand: { minLng: 97, maxLng: 106, minLat: 5, maxLat: 21 },
  Greece: { minLng: 19, maxLng: 30, minLat: 34, maxLat: 42 },
  "Costa Rica": { minLng: -86, maxLng: -82, minLat: 8, maxLat: 12 },
  Japan: { minLng: 128, maxLng: 146, minLat: 30, maxLat: 46 },
  Maldives: { minLng: 72, maxLng: 74, minLat: -1, maxLat: 8 },
};

async function repairLegacyLocations() {
  console.log("=======================================================================");
  console.log("    WANDERLUST PHASE 9.3: SAFE LEGACY GEOLOCATION REPAIR PIPELINE");
  console.log("=======================================================================\n");

  await mongoose.connect(MONGO_URL);

  const allListings = await Listing.find();
  console.log(`[DB Scan] Scanning ${allListings.length} total listings in database...`);

  const affectedListings = allListings.filter((l) => {
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

  console.log(`[Targeted Records] Identified exactly ${affectedListings.length} listings with legacy Mumbai fallback coordinates.\n`);

  const repairLog = [];
  let successCount = 0;
  let manualCount = 0;

  for (const listing of affectedListings) {
    const iso = countryToIso[listing.country];
    const countryBox = bbox[listing.country];
    let resolvedCoords = null;
    let resolvedPlace = "";
    let resolutionType = "";

    // Normalize location query
    let queryLocation = listing.location;
    if (listing.location.toLowerCase().includes("pune")) {
      queryLocation = "Pune, Maharashtra";
    }

    const geocodeOptions = { query: queryLocation, limit: 1 };
    if (iso) geocodeOptions.countries = [iso];

    try {
      const geoRes = await geocodingClient.forwardGeocode(geocodeOptions).send();
      const feat = geoRes.body.features && geoRes.body.features[0];
      if (feat && feat.geometry && feat.geometry.coordinates) {
        resolvedCoords = feat.geometry.coordinates;
        resolvedPlace = feat.place_name;
        resolutionType = "city_level";
      }
    } catch (err) {
      console.warn(`  Warning during geocoding query "${queryLocation}": ${err.message}`);
    }

    // Fallback query if city-level returned nothing and ISO exists (e.g. Serengeti / regional)
    if (!resolvedCoords && iso) {
      try {
        const fallbackRes = await geocodingClient
          .forwardGeocode({ query: listing.country, countries: [iso], limit: 1 })
          .send();
        const feat = fallbackRes.body.features && fallbackRes.body.features[0];
        if (feat && feat.geometry && feat.geometry.coordinates) {
          resolvedCoords = feat.geometry.coordinates;
          resolvedPlace = feat.place_name;
          resolutionType = "country_level_fallback";
        }
      } catch (e) {}
    }

    // Validate bounds
    let isWithinBounds = false;
    if (resolvedCoords && countryBox) {
      isWithinBounds =
        resolvedCoords[0] >= countryBox.minLng &&
        resolvedCoords[0] <= countryBox.maxLng &&
        resolvedCoords[1] >= countryBox.minLat &&
        resolvedCoords[1] <= countryBox.maxLat;
    }

    // Verify coordinates are NOT Mumbai fallback
    const isStillMumbai =
      resolvedCoords &&
      Math.abs(resolvedCoords[0] - 72.8777) < 0.01 &&
      Math.abs(resolvedCoords[1] - 19.076) < 0.01;

    const beforeCoordinates = [...listing.geometry.coordinates];

    if (resolvedCoords && isWithinBounds && !isStillMumbai) {
      // SAFE TO UPDATE
      const updatedNote = `Phase 9.3 Mapbox Verified: ${resolvedPlace} (${resolutionType})`;

      await Listing.findByIdAndUpdate(listing._id, {
        $set: {
          "geometry.coordinates": resolvedCoords,
          isLocationResolved: true,
          locationResolutionNotes: updatedNote,
        },
      });

      successCount++;
      repairLog.push({
        _id: listing._id.toString(),
        title: listing.title,
        location: listing.location,
        country: listing.country,
        beforeCoordinates,
        afterCoordinates: resolvedCoords,
        placeName: resolvedPlace,
        resolutionType,
        status: "REPAIRED_VERIFIED",
      });

      console.log(`  \x1b[32m✔ REPAIRED\x1b[0m: "${listing.title}"`);
      console.log(`     Location: ${listing.location}, ${listing.country}`);
      console.log(`     Old: [${beforeCoordinates.join(", ")}] -> New: [${resolvedCoords.join(", ")}]`);
      console.log(`     Place: ${resolvedPlace}\n`);
    } else {
      // CANNOT BE RELIABLY RESOLVED - FLAG FOR MANUAL REVIEW
      manualCount++;
      const manualNote = `Phase 9.3 Manual Review Required: Geocoding outside bounds or ambiguous (${resolvedPlace || "No Match"})`;

      await Listing.findByIdAndUpdate(listing._id, {
        $set: {
          isLocationResolved: false,
          locationResolutionNotes: manualNote,
          isPublished: false, // Disallow publishing unverified locations per rule
        },
      });

      repairLog.push({
        _id: listing._id.toString(),
        title: listing.title,
        location: listing.location,
        country: listing.country,
        beforeCoordinates,
        afterCoordinates: beforeCoordinates,
        placeName: resolvedPlace || "UNRESOLVED",
        resolutionType: "FAILED_BOUNDS",
        status: "FLAGGED_MANUAL_REVIEW",
      });

      console.log(`  \x1b[33m⚠ MANUAL REVIEW FLAGGED\x1b[0m: "${listing.title}" (${listing.location}, ${listing.country})\n`);
    }
  }

  // Save after-state record
  const latestDir = path.join(__dirname, "..", "backups", "latest");
  if (!fs.existsSync(latestDir)) {
    fs.mkdirSync(latestDir, { recursive: true });
  }
  fs.writeFileSync(path.join(latestDir, "affected_29_after_state.json"), JSON.stringify(repairLog, null, 2), "utf8");

  // Post-update verification
  console.log("--- POST-REPAIR DATABASE RECONCILIATION ---");
  const postAll = await Listing.find().lean();
  let remainingMumbai = 0;
  for (const l of postAll) {
    const coords = l.geometry && l.geometry.coordinates;
    const isLegacyMumbaiFallback =
      Array.isArray(coords) &&
      coords.length === 2 &&
      Math.abs(coords[0] - 72.8777) < 0.01 &&
      Math.abs(coords[1] - 19.076) < 0.01 &&
      !((l.location || "").toLowerCase().includes("mumbai") ||
        (l.location || "").toLowerCase().includes("bombay"));

    if (isLegacyMumbaiFallback) {
      remainingMumbai++;
    }
  }

  console.log(`Total Database Listings: ${postAll.length} (Expected: 150)`);
  console.log(`Successfully Repaired: ${successCount}`);
  console.log(`Flagged for Manual Review: ${manualCount}`);
  console.log(`Remaining Legacy Mumbai Fallbacks for Non-Mumbai Listings: ${remainingMumbai} (Target: 0)`);

  if (remainingMumbai === 0 && postAll.length === 150) {
    console.log("\n\x1b[32m✔ SUCCESS: 100% of legacy Mumbai fallback coordinates have been safely resolved or flagged.\x1b[0m\n");
  } else {
    console.error("\n\x1b[31m✖ ERROR: Inconsistency detected during post-repair audit.\x1b[0m\n");
  }

  await mongoose.disconnect();
  return { successCount, manualCount, remainingMumbai, repairLog };
}

if (require.main === module) {
  repairLegacyLocations().catch((err) => {
    console.error("Repair fatal error:", err);
    process.exit(1);
  });
}

module.exports = { repairLegacyLocations };
