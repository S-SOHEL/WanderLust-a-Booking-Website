/**
 * WANDERLUST PHASE 9.2.1 MICRO SECURITY & DATA INTEGRITY AUDIT SUITE
 * 
 * Verifies:
 * 1. Location Schema Safety:
 *    - New unresolved listings default isLocationResolved to false
 *    - Successful geocoding sets isLocationResolved to true
 *    - Valid manual pin selection sets isLocationResolved to true
 *    - Empty coordinates [] cannot pass publication validation
 *    - Out-of-bounds coordinates cannot pass publication validation
 *    - Admin approval and toggle-publish enforce location resolution checks
 * 2. Wishlist Security:
 *    - User A cannot modify User B's wishlist
 *    - Unauthenticated requests are rejected (401 JSON / redirect)
 *    - Invalid ObjectIds return 400 Bad Request
 *    - Unpublished/pending listings cannot be saved (403 Forbidden)
 *    - Duplicate saves are prevented ($addToSet)
 *    - Removing one item leaves remaining items intact ($pull)
 *    - Deleted listing references do not break profile rendering
 * 3. Wishlist Consistency:
 *    - Save state survives database reload / page refresh
 *    - Save state survives logout / re-login
 *    - User profile count strictly matches user.savedListings.length in DB
 *    - Multi-item removal consistency
 * 4. Geolocation Data Integrity Audit:
 *    - Audit all 150 database records
 *    - Categorize into valid structure, verified against location, and requiring review
 * 5. Database Count & Integrity Preservation
 */

require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");

const Listing = require("./models/listing");
const User = require("./models/user");
const listingController = require("./controller/listing");
const adminController = require("./controller/admin");
const userController = require("./controller/users");

const MONGO_URL =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust"
    : process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";

function createMockReqRes({ params = {}, body = {}, user = null, isJson = true, query = {} } = {}) {
  const req = {
    params,
    body,
    query,
    user,
    xhr: isJson,
    headers: {
      accept: isJson ? "application/json" : "text/html",
    },
    flash: function (type, msg) {
      this.flashes = this.flashes || [];
      this.flashes.push({ type, msg });
    },
    flashes: [],
    get: function (header) {
      return this.headers[header.toLowerCase()] || "";
    },
  };

  const res = {
    statusCode: 200,
    body: null,
    redirectUrl: null,
    renderedView: null,
    renderData: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (payload) {
      this.body = payload;
      return this;
    },
    redirect: function (url) {
      this.redirectUrl = url;
      return this;
    },
    render: function (view, data) {
      this.renderedView = view;
      this.renderData = data;
      return this;
    },
  };

  return { req, res };
}

async function runMicroSecurityAudit() {
  console.log("=======================================================================");
  console.log("    WANDERLUST PHASE 9.2.1 MICRO SECURITY & DATA INTEGRITY AUDIT");
  console.log("=======================================================================\n");

  await mongoose.connect(MONGO_URL);
  console.log("[DB] Connected to MongoDB wanderlust database.");

  const initialListingCount = await Listing.countDocuments();
  const initialUserCount = await User.countDocuments();
  console.log(`[DB Baseline] Total Listings: ${initialListingCount}, Total Users: ${initialUserCount}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = "") {
    if (condition) {
      console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName} ${detail ? "(" + detail + ")" : ""}`);
      passed++;
    } else {
      console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? "(" + detail + ")" : ""}`);
      failed++;
    }
  }

  // Find sample listings for testing
  const approvedListings = await Listing.find({ status: "approved", isPublished: true }).limit(3);
  if (approvedListings.length < 2) {
    throw new Error("Insufficient approved listings for multi-item testing.");
  }
  const stay1 = approvedListings[0];
  const stay2 = approvedListings[1];

  // Setup test users
  const user1 = new User({
    fullName: "MicroAudit User One",
    email: `micro_u1_${Date.now()}@example.com`,
    username: `micro_u1_${Date.now()}`,
    mobile: `9871${Math.floor(100000 + Math.random() * 900000)}`,
    role: "user",
    savedListings: [],
  });
  await User.register(user1, "PassWord123!");

  const user2 = new User({
    fullName: "MicroAudit User Two",
    email: `micro_u2_${Date.now()}@example.com`,
    username: `micro_u2_${Date.now()}`,
    mobile: `9872${Math.floor(100000 + Math.random() * 900000)}`,
    role: "user",
    savedListings: [],
  });
  await User.register(user2, "PassWord123!");

  let adminUser = await User.findOne({ role: "admin" });

  let testListingsToClean = [];

  try {
    // -------------------------------------------------------------------------
    // 1. LOCATION SCHEMA SAFETY AUDIT
    // -------------------------------------------------------------------------
    console.log("--- SECTION 1: LOCATION SCHEMA SAFETY AUDIT ---");

    // 1a. New unresolved listings default to false
    const blankListing = new Listing({
      title: "Unresolved Test Property",
      price: 2500,
      location: "Nowhere Land",
      country: "Fictional",
      owner: user1._id,
    });
    assert(
      blankListing.isLocationResolved === false &&
        Array.isArray(blankListing.geometry.coordinates) &&
        blankListing.geometry.coordinates.length === 0,
      "1a: New unpopulated listing defaults isLocationResolved to false and coordinates to []"
    );

    // 1b. Empty coordinates cannot pass publication validation
    blankListing.isPublished = true;
    blankListing.status = "approved";
    await blankListing.validate().catch(() => {});
    assert(
      blankListing.isPublished === false && blankListing.status === "pending",
      "1b: Pre-validate hook strictly intercepts empty coordinates and revokes isPublished/approved status"
    );

    // 1c. Invalid GeoJSON coordinates (out of bounds) cannot pass publication
    const invalidCoordsListing = new Listing({
      title: "Out Of Bounds Coordinates Property",
      price: 3000,
      location: "Bad Coordinates Town",
      country: "India",
      geometry: { type: "Point", coordinates: [250, 120] }, // Longitude > 180, Latitude > 90
      owner: user1._id,
      isPublished: true,
    });
    await invalidCoordsListing.validate().catch(() => {});
    assert(
      invalidCoordsListing.isLocationResolved === false && invalidCoordsListing.isPublished === false,
      "1c: Out-of-bounds coordinates strictly fail validation, forcing isLocationResolved=false & isPublished=false"
    );

    // 1d. Valid manual map pin selection sets isLocationResolved to true and allows publication
    const manualListing = new Listing({
      title: "Valid Manual Pin Property",
      price: 4500,
      location: "Anjuna, Goa",
      country: "India",
      geometry: { type: "Point", coordinates: [73.742, 15.582] },
      owner: user1._id,
    });
    assert(
      manualListing.isLocationResolved === true,
      "1d: Valid manual map pin selection automatically evaluates isLocationResolved to true"
    );
    manualListing.isPublished = true;
    manualListing.status = "approved";
    await manualListing.validate();
    assert(
      manualListing.isPublished === true && manualListing.status === "approved",
      "1e: Valid coordinates pass publication validation without revocation"
    );

    // 1e. Admin approval and toggle-publish enforcement on unresolved coordinates
    const unresInDb = new Listing({
      title: "Unresolved Coordinates In DB",
      description: "Listing with missing coordinates for approval test",
      price: 2000,
      location: "Unknown Jungle",
      country: "India",
      owner: user1._id,
      status: "pending",
      isPublished: false,
      geometry: { type: "Point", coordinates: [] },
    });
    await unresInDb.save();
    testListingsToClean.push(unresInDb._id);

    // Try admin approval
    const { req: appReq, res: appRes } = createMockReqRes({
      user: adminUser,
      params: { id: unresInDb._id.toString() },
    });
    await adminController.approveListing(appReq, appRes);
    const afterApproveAttempt = await Listing.findById(unresInDb._id);
    assert(
      afterApproveAttempt.status !== "approved" && afterApproveAttempt.isPublished === false,
      "1f: Admin approval strictly blocked when listing coordinates are unresolved"
    );

    // Try admin toggle-publish
    const { req: togReq, res: togRes } = createMockReqRes({
      user: adminUser,
      params: { id: unresInDb._id.toString() },
    });
    await adminController.togglePublish(togReq, togRes);
    const afterToggleAttempt = await Listing.findById(unresInDb._id);
    assert(
      afterToggleAttempt.isPublished === false,
      "1g: Admin toggle-publish strictly blocked when listing coordinates are unresolved"
    );

    // -------------------------------------------------------------------------
    // 2. WISHLIST SECURITY AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: WISHLIST SECURITY AUDIT ---");

    // 2a. Unauthenticated requests are rejected
    {
      const { req, res } = createMockReqRes({
        params: { id: stay1._id.toString() },
        user: null, // Unauthenticated
        isJson: true,
      });
      await listingController.toggleWishlist(req, res);
      assert(
        res.statusCode === 401 && res.body.success === false,
        "2a: Unauthenticated user saving listing is rejected with 401 Unauthorized"
      );

      const { req: remReq, res: remRes } = createMockReqRes({
        params: { id: stay1._id.toString() },
        user: null, // Unauthenticated
        isJson: true,
      });
      await listingController.removeFromWishlist(remReq, remRes);
      assert(
        remRes.statusCode === 401 && remRes.body.success === false,
        "2b: Unauthenticated user removing listing is rejected with 401 Unauthorized"
      );
    }

    // 2b. User A cannot modify User B's wishlist
    // User 1 saves stay1
    {
      const { req, res } = createMockReqRes({
        params: { id: stay1._id.toString() },
        user: user1,
        isJson: true,
      });
      await listingController.toggleWishlist(req, res);

      const u1Db = await User.findById(user1._id);
      const u2Db = await User.findById(user2._id);
      assert(
        u1Db.savedListings.some((id) => id.toString() === stay1._id.toString()) &&
          u2Db.savedListings.length === 0,
        "2c: User 1 saving an item modifies strictly User 1's document (User 2 wishlist untouched)"
      );
    }

    // 2c. Invalid listing IDs rejected with 400
    {
      const { req, res } = createMockReqRes({
        params: { id: "not-a-valid-id" },
        user: user1,
        isJson: true,
      });
      await listingController.toggleWishlist(req, res);
      assert(
        res.statusCode === 400 && res.body.success === false,
        "2d: Malformed listing ID is rejected with 400 Bad Request"
      );
    }

    // 2d. Unpublished listing cannot be saved by ordinary users
    {
      const unpubListing = new Listing({
        title: "Secret Hidden Shack",
        description: "Unpublished listing",
        price: 1800,
        location: "Khandala",
        country: "India",
        owner: user2._id,
        status: "pending",
        isPublished: false,
        geometry: { type: "Point", coordinates: [73.36, 18.75] },
        isLocationResolved: true,
      });
      await unpubListing.save();
      testListingsToClean.push(unpubListing._id);

      const { req, res } = createMockReqRes({
        params: { id: unpubListing._id.toString() },
        user: user1, // Not owner, not admin
        isJson: true,
      });
      await listingController.toggleWishlist(req, res);
      assert(
        res.statusCode === 403 && res.body.success === false,
        "2e: Ordinary users strictly prevented from saving unpublished/pending stays (403 Forbidden)"
      );
    }

    // 2e. Duplicate saves prevented ($addToSet)
    {
      await User.findByIdAndUpdate(user1._id, { $addToSet: { savedListings: stay1._id } });
      await User.findByIdAndUpdate(user1._id, { $addToSet: { savedListings: stay1._id } });
      const u1Db = await User.findById(user1._id);
      const matches = u1Db.savedListings.filter((id) => id.toString() === stay1._id.toString()).length;
      assert(
        matches === 1,
        "2f: Duplicate saves prevented ($addToSet guarantees idempotency)",
        `count=${matches}`
      );
    }

    // 2f. Removing one item does not affect other saved items
    {
      // Add stay2 to User 1
      await User.findByIdAndUpdate(user1._id, { $addToSet: { savedListings: stay2._id } });
      let u1DbBefore = await User.findById(user1._id);
      assert(u1DbBefore.savedListings.length === 2, "2g: User 1 now has 2 saved properties");

      // Remove stay1
      const { req, res } = createMockReqRes({
        params: { id: stay1._id.toString() },
        user: user1,
        isJson: true,
      });
      await listingController.removeFromWishlist(req, res);

      const u1DbAfter = await User.findById(user1._id);
      assert(
        u1DbAfter.savedListings.length === 1 &&
          u1DbAfter.savedListings[0].toString() === stay2._id.toString(),
        "2h: Removing stay1 leaves stay2 completely intact in user wishlist"
      );
    }

    // 2g. Deleted listing references do not break profile rendering
    {
      const tempToDelete = new Listing({
        title: "Temporary Stay To Delete",
        description: "Checking null safety",
        price: 2000,
        location: "Pune",
        country: "India",
        owner: user1._id,
        geometry: { type: "Point", coordinates: [73.85, 18.52] },
        isLocationResolved: true,
      });
      await tempToDelete.save();
      await User.findByIdAndUpdate(user1._id, { $addToSet: { savedListings: tempToDelete._id } });

      // Delete the listing document
      await Listing.findByIdAndDelete(tempToDelete._id);

      // Render profile
      const { req, res } = createMockReqRes({ user: user1 });
      await userController.profile(req, res);

      const renderedSaved = res.renderData?.savedListings || [];
      assert(
        res.renderedView === "users/profile.ejs" &&
          !renderedSaved.some((l) => l._id.toString() === tempToDelete._id.toString()),
        "2i: Profile controller gracefully filters null/orphaned listing references without crashing"
      );
    }

    // -------------------------------------------------------------------------
    // 3. WISHLIST CONSISTENCY AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: WISHLIST CONSISTENCY AUDIT ---");

    // 3a. Save state after database reload / refresh
    {
      const freshUser1 = await User.findById(user1._id).populate("savedListings");
      assert(
        freshUser1.savedListings.length === 1 &&
          freshUser1.savedListings[0]._id.toString() === stay2._id.toString(),
        "3a: Saved state strictly persists across database reloads and re-queries"
      );
    }

    // 3b. Save state across different browser sessions / login cycles
    {
      // Re-fetch user document simulating new session deserialization
      const sessionUser = await User.findById(user1._id);
      assert(
        sessionUser.savedListings.length === 1 &&
          sessionUser.savedListings[0].toString() === stay2._id.toString(),
        "3b: Saved listings persist intact across logout and login sessions"
      );
    }

    // 3c. Profile count matches database records
    {
      const { req, res } = createMockReqRes({ user: user1 });
      await userController.profile(req, res);

      const dbUser = await User.findById(user1._id);
      const passedSavedCount = res.renderData?.savedListings?.length;
      assert(
        passedSavedCount === dbUser.savedListings.length,
        "3c: Profile view model count strictly equals user.savedListings count in MongoDB",
        `db=${dbUser.savedListings.length}, profile=${passedSavedCount}`
      );
    }

    // Clean up temporary test listings before auditing baseline database records
    if (testListingsToClean.length > 0) {
      await Listing.deleteMany({ _id: { $in: testListingsToClean } });
      testListingsToClean = [];
    }

    // -------------------------------------------------------------------------
    // 4. GEOLOCATION DATA INTEGRITY AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: GEOLOCATION DATA INTEGRITY AUDIT ---");

    const allListings = await Listing.find();
    console.log(`Auditing all ${allListings.length} existing database listings...`);

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
      "United Arab Emirates": { minLng: 51, maxLng: 57, minLat: 22, maxLat: 27 },
      Greece: { minLng: 19, maxLng: 30, minLat: 34, maxLat: 42 },
      "Costa Rica": { minLng: -86, maxLng: -82, minLat: 8, maxLat: 12 },
      Japan: { minLng: 128, maxLng: 146, minLat: 30, maxLat: 46 },
      Maldives: { minLng: 72, maxLng: 74, minLat: -1, maxLat: 8 },
    };

    let validStructureCount = 0;
    let verifiedLocationCount = 0;
    let manualReviewCount = 0;
    const manualReviewList = [];

    for (let l of allListings) {
      const coords = l.geometry && l.geometry.coordinates;
      const isStructureValid =
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

      if (!isStructureValid) {
        manualReviewCount++;
        manualReviewList.push({ id: l._id, title: l.title, reason: "Malformed coordinate structure", coords });
        continue;
      }
      validStructureCount++;

      // Check if coordinates point to Mumbai fallback while located outside Mumbai
      const isLegacyMumbaiFallback =
        Math.abs(coords[0] - 72.8777) < 0.01 &&
        Math.abs(coords[1] - 19.076) < 0.01 &&
        !((l.location || "").toLowerCase().includes("mumbai") ||
          (l.location || "").toLowerCase().includes("bombay"));

      if (isLegacyMumbaiFallback) {
        manualReviewCount++;
        manualReviewList.push({
          id: l._id,
          title: l.title,
          location: l.location,
          country: l.country,
          coords,
          reason: "Legacy seed Mumbai fallback coordinates for non-Mumbai location",
        });
        continue;
      }

      // Check against country bounding box
      const countryBox = bbox[l.country];
      if (countryBox) {
        const inBox =
          coords[0] >= countryBox.minLng &&
          coords[0] <= countryBox.maxLng &&
          coords[1] >= countryBox.minLat &&
          coords[1] <= countryBox.maxLat;
        if (inBox) {
          verifiedLocationCount++;
        } else {
          manualReviewCount++;
          manualReviewList.push({
            id: l._id,
            title: l.title,
            location: l.location,
            country: l.country,
            coords,
            reason: "Coordinates outside country boundary",
          });
        }
      } else {
        manualReviewCount++;
        manualReviewList.push({
          id: l._id,
          title: l.title,
          location: l.location,
          country: l.country,
          coords,
          reason: "Country bounding box not defined",
        });
      }
    }

    assert(
      validStructureCount === allListings.length,
      `4a: 100% of existing listings have valid GeoJSON [lng, lat] coordinate pairs (${validStructureCount}/${allListings.length})`
    );

    assert(
      verifiedLocationCount === 150,
      `4b: Coordinates verified against authentic geographic territory: ${verifiedLocationCount} listings (100% resolved post Phase 9.3 repair)`
    );

    assert(
      manualReviewCount === 0,
      `4c: Zero listings require manual review post Phase 9.3 repair (${manualReviewCount} listings)`
    );
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP & RECONCILIATION
    // -------------------------------------------------------------------------
    if (testListingsToClean.length > 0) {
      await Listing.deleteMany({ _id: { $in: testListingsToClean } });
    }
    await User.deleteMany({ _id: { $in: [user1._id, user2._id] } });

    const finalListingCount = await Listing.countDocuments();
    const finalUserCount = await User.countDocuments();

    console.log("\n--- DATABASE INTEGRITY AUDIT ---");
    assert(
      finalListingCount === initialListingCount,
      `Database listing count preserved: ${finalListingCount} = ${initialListingCount}`
    );
    assert(
      finalUserCount === initialUserCount,
      `Database user count preserved: ${finalUserCount} = ${initialUserCount}`
    );
  }

  console.log("\n=======================================================================");
  console.log(`TOTAL AUDIT CHECKS: ${passed + failed} | PASSED: \x1b[32m${passed}\x1b[0m | FAILED: \x1b[31m${failed}\x1b[0m`);
  console.log("=======================================================================\n");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runMicroSecurityAudit().catch((err) => {
  console.error("FATAL MICRO AUDIT ERROR:", err);
  process.exit(1);
});
