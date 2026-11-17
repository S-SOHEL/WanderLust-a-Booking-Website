require("dotenv").config();
const mongoose = require("mongoose");
const Listing = require("../models/listing");

const MONGO_URL =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust"
    : process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";

const flaggedMetadata = {
  "6a835b69ee9059e578bd85df": {
    flag: "LOCATION_UNCERTAIN",
    notes: "Serengeti National Park: Stored coordinates [34.823454, -6.270353] represent central Tanzania centroid (~400km south of park boundary). Flagged for exact map-pin correction.",
    status: "PENDING_ADMIN_REVIEW",
  },
  "6a835b69ee9059e578bd85e1": {
    flag: "GENERIC_REGION_CENTROID",
    notes: "Fiji: Country centroid [178.4406, -18.1456]. Legitimate regional representation; do not guess exact property coordinates without host specification.",
    status: "EXEMPT_REGIONAL",
  },
  "6a835b69ee9059e578bd85e8": {
    flag: "GENERIC_REGION_CENTROID",
    notes: "Scottish Highlands: Regional centroid [-4.71, 57.12]. Retain until specific estate/castle address is provided.",
    status: "EXEMPT_REGIONAL",
  },
  "6a835b69ee9059e578bd85ea": {
    flag: "GENERIC_REGION_CENTROID",
    notes: "Montana: State centroid [-109.172599, 47.072515]. Retain until specific town/address is confirmed.",
    status: "EXEMPT_REGIONAL",
  },
  "6a835b69ee9059e578bd85ec": {
    flag: "GENERIC_REGION_CENTROID",
    notes: "Costa Rica: Country centroid [-84.200915, 10.257794]. Retain until specific canton/address is provided.",
    status: "EXEMPT_REGIONAL",
  },
  "6a835b69ee9059e578bd85ef": {
    flag: "GENERIC_REGION_CENTROID",
    notes: "New Hampshire: State centroid [-71.578305, 43.689888]. Retain until specific lake/town is confirmed.",
    status: "EXEMPT_REGIONAL",
  },
  "6a835b69ee9059e578bd85f0": {
    flag: "GENERIC_REGION_CENTROID",
    notes: "Maldives: Country/atoll centroid [73.511049, 4.178874]. Retain until specific resort island is confirmed.",
    status: "EXEMPT_REGIONAL",
  },
  "6a835b69ee9059e578bd85f2": {
    flag: "GENERIC_REGION_CENTROID",
    notes: "Costa Rica: Country centroid [-84.200915, 10.257794]. Retain until specific canton/address is provided.",
    status: "EXEMPT_REGIONAL",
  },
  "6a835c4c9cc3be0fc7a52ba8": {
    flag: "TITLE_LOCATION_MISMATCH",
    notes: "Title describes Costa Rica Pacific coast property, but stored location is Pune, India [73.856285, 18.515669]. Requires admin decision.",
    status: "PENDING_ADMIN_REVIEW",
  },
  "6a848560cd5fe570c378cbaf": {
    flag: "TITLE_LOCATION_MISMATCH",
    notes: "Title describes Costa Rica Pacific coast property, but stored location is Pune, India [73.856285, 18.515669]. Requires admin decision.",
    status: "PENDING_ADMIN_REVIEW",
  },
  "6a84b612ae28b2bb0537a4a6": {
    flag: "TITLE_LOCATION_MISMATCH",
    notes: "Title describes Costa Rica Pacific coast property, but stored location is Pune, India [73.856285, 18.515669]. Requires admin decision.",
    status: "PENDING_ADMIN_REVIEW",
  },
  "6a848373728df9b85f59c2bc": {
    flag: "TEST_DATA_REQUIRES_REVIEW",
    notes: "Title 'sjs' indicates test/placeholder data with Pune centroid [73.856285, 18.515669]. Requires admin review.",
    status: "PENDING_ADMIN_REVIEW",
  },
  "6a8485086210b402d2ab6c8e": {
    flag: "TEST_DATA_REQUIRES_REVIEW",
    notes: "Title 'sjs' indicates test/placeholder data with Pune centroid [73.856285, 18.515669]. Requires admin review.",
    status: "PENDING_ADMIN_REVIEW",
  },
};

async function populateFlags() {
  console.log("=== POPULATING REMEDIATION METADATA (NON-DESTRUCTIVE) ===");
  await mongoose.connect(MONGO_URL);

  let updatedFlagged = 0;
  for (const [id, meta] of Object.entries(flaggedMetadata)) {
    const res = await Listing.updateOne(
      { _id: id },
      {
        $set: {
          remediationFlag: meta.flag,
          remediationNotes: meta.notes,
          remediationReviewStatus: meta.status,
        },
      }
    );
    if (res.matchedCount > 0) {
      updatedFlagged++;
    }
  }

  // Ensure default on other listings without mutating coordinates, titles, owners, etc.
  const flaggedIds = Object.keys(flaggedMetadata);
  const otherRes = await Listing.updateMany(
    { _id: { $nin: flaggedIds }, remediationFlag: { $exists: false } },
    {
      $set: {
        remediationFlag: "NONE",
        remediationNotes: "",
        remediationReviewStatus: "RESOLVED",
      },
    }
  );

  console.log(`[Success] Flagged listings updated: ${updatedFlagged}/13`);
  console.log(`[Success] Other listings initialized: ${otherRes.modifiedCount}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  populateFlags().catch((err) => {
    console.error("Population error:", err);
    process.exit(1);
  });
}

module.exports = { populateFlags, flaggedMetadata };
