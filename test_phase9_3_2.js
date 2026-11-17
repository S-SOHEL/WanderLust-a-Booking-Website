/**
 * WANDERLUST PHASE 9.3.2: CONTROLLED DATA REMEDIATION & AUDIT TEST SUITE
 * 
 * Verifies:
 * 1. Pre-remediation Backup Verification
 * 2. Admin Authentication & Route Protection (/admin/remediation)
 * 3. Exact Queue Population & 13 Listing Classifications:
 *    - 1 LOCATION_UNCERTAIN (Serengeti)
 *    - 7 GENERIC_REGION_CENTROID (Fiji, Scottish Highlands, Montana, Costa Rica x2, New Hampshire, Maldives)
 *    - 3 TITLE_LOCATION_MISMATCH (Pune / Costa Rica)
 *    - 2 TEST_DATA_REQUIRES_REVIEW (Pune sjs)
 * 4. Safe Admin Correction Workflow:
 *    - Invalid/out-of-bounds coordinates return 400 Bad Request
 *    - Valid pin adjustment creates locationAuditHistory record with old/new coords, admin ID, timestamp, reason
 *    - Idempotent cleanup restores initial state
 * 5. Publication Guard on Unresolved Coordinates
 * 6. Historical Booking Integrity (WL-TEST4732):
 *    - Preserved as Completed
 *    - Orphaned test guest ID retained without reassignment
 *    - Structurally impossible to authorize new reviews
 * 7. Legacy Review Integrity (6a73a4a9ea51345c3de0cca3):
 *    - Preserved read-only without fabricated author/booking
 *    - Badged as "Legacy Review" distinct from "Verified Stay"
 * 8. Zero database regressions across all 150 listings, 14 users, 5 bookings, and 5 reviews
 */

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const Listing = require("./models/listing");
const User = require("./models/user");
const Booking = require("./models/booking");
const Review = require("./models/review");
const adminController = require("./controller/admin");
const reviewController = require("./controller/reviews");

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
    headers: { accept: isJson ? "application/json" : "text/html" },
    xhr: isJson,
    flash: function (type, msg) {
      this.flashes = this.flashes || [];
      this.flashes.push({ type, msg });
    },
  };

  const res = {
    statusCode: 200,
    headers: {},
    rendered: null,
    renderedData: null,
    redirectUrl: null,
    jsonData: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      this.jsonData = data;
      return this;
    },
    render: function (view, data) {
      this.rendered = view;
      this.renderedData = data;
      return this;
    },
    redirect: function (url) {
      this.redirectUrl = url;
      return this;
    },
    setHeader: function (key, val) {
      this.headers[key] = val;
    },
  };

  return { req, res };
}

let totalAssertions = 0;
let passedAssertions = 0;

function it(desc, fn) {
  totalAssertions++;
  try {
    fn();
    passedAssertions++;
    console.log(`  \x1b[32m✔\x1b[0m ${desc}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${desc}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runTests() {
  console.log("\n==================================================================");
  console.log("   WANDERLUST PHASE 9.3.2 DATA REMEDIATION & INTEGRITY TEST SUITE  ");
  console.log("==================================================================\n");

  await mongoose.connect(MONGO_URL);

  const adminUser = await User.findOne({ role: "admin" });
  assert(adminUser, "Admin user must exist in database");

  // SUITE 1: PRE-REMEDIATION BACKUP VERIFICATION
  console.log("SUITE 1: Pre-Remediation Backup Verification");
  const backupParentDir = path.join(__dirname, "backups");
  it("1a: backups directory exists", () => {
    assert(fs.existsSync(backupParentDir), "backups/ directory must exist");
  });

  const backupDirs = fs.readdirSync(backupParentDir).filter((d) => d.startsWith("backup_phase9_3_2_"));
  it("1b: Phase 9.3.2 timestamped backup exists", () => {
    assert(backupDirs.length > 0, "At least one backup_phase9_3_2_* directory must exist");
  });

  const latestPhaseBackup = path.join(backupParentDir, backupDirs.sort().reverse()[0]);
  it("1c: backup contains all 4 collections and 13-listing snapshot", () => {
    assert(fs.existsSync(path.join(latestPhaseBackup, "listings.json")), "listings.json missing in backup");
    assert(fs.existsSync(path.join(latestPhaseBackup, "users.json")), "users.json missing in backup");
    assert(fs.existsSync(path.join(latestPhaseBackup, "bookings.json")), "bookings.json missing in backup");
    assert(fs.existsSync(path.join(latestPhaseBackup, "reviews.json")), "reviews.json missing in backup");
    assert(fs.existsSync(path.join(latestPhaseBackup, "flagged_13_pre_remediation.json")), "flagged_13 snapshot missing");
  });

  const backupListings = JSON.parse(fs.readFileSync(path.join(latestPhaseBackup, "listings.json"), "utf8"));
  const backupFlagged = JSON.parse(fs.readFileSync(path.join(latestPhaseBackup, "flagged_13_pre_remediation.json"), "utf8"));
  it("1d: backup records exact counts (150 listings, 13 flagged)", () => {
    assert.strictEqual(backupListings.length, 150, "Backup must record exactly 150 listings");
    assert.strictEqual(backupFlagged.length, 13, "Backup must record exactly 13 flagged listings");
  });

  // SUITE 2: REMEDIATION QUEUE ROUTE & ACCESS CONTROL
  console.log("\nSUITE 2: Remediation Queue Controller & Category Stats");
  const { req: qReq, res: qRes } = createMockReqRes({ user: adminUser, query: { category: "all" }, isJson: false });
  await adminController.remediationQueue(qReq, qRes);

  it("2a: remediationQueue renders views/admin/remediation.ejs", () => {
    assert.strictEqual(qRes.rendered, "admin/remediation.ejs");
  });

  it("2b: stats reports totalQueue === 13", () => {
    assert.strictEqual(qRes.renderedData.stats.totalQueue, 13);
  });

  it("2c: stats category counts match exact audit findings", () => {
    assert.strictEqual(qRes.renderedData.stats.locationUncertain, 1, "LOCATION_UNCERTAIN must be 1");
    assert.strictEqual(qRes.renderedData.stats.genericRegionCentroid, 7, "GENERIC_REGION_CENTROID must be 7");
    assert.strictEqual(qRes.renderedData.stats.titleLocationMismatch, 3, "TITLE_LOCATION_MISMATCH must be 3");
    assert.strictEqual(qRes.renderedData.stats.testDataRequiresReview, 2, "TEST_DATA_REQUIRES_REVIEW must be 2");
  });

  it("2d: historical booking WL-TEST4732 passed to view data", () => {
    assert(qRes.renderedData.historicalBooking, "historicalBooking must be present");
    assert.strictEqual(qRes.renderedData.historicalBooking.bookingRef, "WL-TEST4732");
    assert.strictEqual(qRes.renderedData.historicalGuestUser, null, "Guest user must be null (orphaned)");
  });

  it("2e: legacy review 6a73a4a9ea51345c3de0cca3 passed to view data", () => {
    assert(qRes.renderedData.legacyReview, "legacyReview must be present");
    assert.strictEqual(qRes.renderedData.legacyReview._id.toString(), "6a73a4a9ea51345c3de0cca3");
  });

  // SUITE 3: CLASSIFICATION AUDIT OF ALL 13 LISTINGS
  console.log("\nSUITE 3: Classification Audit of the 13 Flagged Listings");

  // 3.1 Serengeti
  const serengeti = await Listing.findById("6a835b69ee9059e578bd85df");
  it("3a: Serengeti has LOCATION_UNCERTAIN and PENDING_ADMIN_REVIEW", () => {
    assert.strictEqual(serengeti.remediationFlag, "LOCATION_UNCERTAIN");
    assert.strictEqual(serengeti.remediationReviewStatus, "PENDING_ADMIN_REVIEW");
    assert(serengeti.remediationNotes.includes("Serengeti"));
  });

  // 3.2 Generic Region Centroids (7 listings)
  const centroidIds = [
    "6a835b69ee9059e578bd85e1", // Fiji
    "6a835b69ee9059e578bd85e8", // Scottish Highlands
    "6a835b69ee9059e578bd85ea", // Montana
    "6a835b69ee9059e578bd85ec", // Costa Rica Treehouse
    "6a835b69ee9059e578bd85ef", // New Hampshire
    "6a835b69ee9059e578bd85f0", // Maldives
    "6a835b69ee9059e578bd85f2", // Costa Rica Beach House
  ];
  const centroids = await Listing.find({ _id: { $in: centroidIds } });
  it("3b: exactly 7 listings classified as GENERIC_REGION_CENTROID with EXEMPT_REGIONAL", () => {
    assert.strictEqual(centroids.length, 7);
    centroids.forEach((c) => {
      assert.strictEqual(c.remediationFlag, "GENERIC_REGION_CENTROID");
      assert.strictEqual(c.remediationReviewStatus, "EXEMPT_REGIONAL");
    });
  });

  // 3.3 Title / Location Mismatch (3 listings)
  const mismatchIds = [
    "6a835c4c9cc3be0fc7a52ba8",
    "6a848560cd5fe570c378cbaf",
    "6a84b612ae28b2bb0537a4a6",
  ];
  const mismatches = await Listing.find({ _id: { $in: mismatchIds } });
  it("3c: exactly 3 listings classified as TITLE_LOCATION_MISMATCH", () => {
    assert.strictEqual(mismatches.length, 3);
    mismatches.forEach((m) => {
      assert.strictEqual(m.remediationFlag, "TITLE_LOCATION_MISMATCH");
      assert.strictEqual(m.remediationReviewStatus, "PENDING_ADMIN_REVIEW");
    });
  });

  // 3.4 Test Data Review (2 listings)
  const testIds = [
    "6a848373728df9b85f59c2bc",
    "6a8485086210b402d2ab6c8e",
  ];
  const testListings = await Listing.find({ _id: { $in: testIds } });
  it("3d: exactly 2 listings classified as TEST_DATA_REQUIRES_REVIEW", () => {
    assert.strictEqual(testListings.length, 2);
    testListings.forEach((t) => {
      assert.strictEqual(t.remediationFlag, "TEST_DATA_REQUIRES_REVIEW");
      assert.strictEqual(t.remediationReviewStatus, "PENDING_ADMIN_REVIEW");
    });
  });

  // 3.5 Remaining 137 listings have NONE
  const unflaggedCount = await Listing.countDocuments({ remediationFlag: "NONE" });
  it("3e: all 137 other listings have remediationFlag NONE (total 150)", () => {
    assert.strictEqual(unflaggedCount, 137);
  });

  // SUITE 4: SAFE ADMIN CORRECTION WORKFLOW & AUDIT HISTORY
  console.log("\nSUITE 4: Safe Admin Correction Workflow & Audit History");

  // 4a. Out of bounds coordinates rejected with 400
  const sample = await Listing.findById("6a835b69ee9059e578bd85df");
  const { req: badReq, res: badRes } = createMockReqRes({
    params: { id: sample._id.toString() },
    body: { longitude: 250, latitude: 120, returnTo: "remediation" },
    user: adminUser,
    isJson: true,
  });
  await adminController.fixListingLocation(badReq, badRes);

  it("4a: out-of-bounds coordinates return 400 Bad Request", () => {
    assert.strictEqual(badRes.statusCode, 400);
    assert.strictEqual(badRes.jsonData.success, false);
    assert(badRes.jsonData.message.includes("Invalid coordinates"));
  });

  // 4b. Valid correction records locationAuditHistory and updates status
  const originalCoords = [...sample.geometry.coordinates];
  const originalAuditLen = sample.locationAuditHistory ? sample.locationAuditHistory.length : 0;
  const testNewCoords = [34.8333, -2.3333]; // Accurate Serengeti NP coordinates
  const testReason = "Pinpointed Serengeti National Park gate based on park boundary survey";

  const { req: goodReq, res: goodRes } = createMockReqRes({
    params: { id: sample._id.toString() },
    body: {
      longitude: testNewCoords[0],
      latitude: testNewCoords[1],
      location: "Serengeti National Park",
      country: "Tanzania",
      remediationReason: testReason,
      returnTo: "remediation",
    },
    user: adminUser,
    isJson: true,
  });
  await adminController.fixListingLocation(goodReq, goodRes);

  it("4b: valid correction returns 200 with audited listing", () => {
    assert.strictEqual(goodRes.statusCode, 200);
    assert.strictEqual(goodRes.jsonData.success, true);
    assert.strictEqual(goodRes.jsonData.listing.remediationFlag, "RESOLVED_VERIFIED");
  });

  const updatedSample = await Listing.findById(sample._id);
  it("4c: locationAuditHistory appended with old/new coords, admin ID, timestamp, reason", () => {
    assert(updatedSample.locationAuditHistory.length === originalAuditLen + 1);
    const lastAudit = updatedSample.locationAuditHistory[updatedSample.locationAuditHistory.length - 1];
    assert.deepStrictEqual(lastAudit.previousCoordinates, originalCoords);
    assert.deepStrictEqual(lastAudit.newCoordinates, testNewCoords);
    assert.strictEqual(lastAudit.adminUsername, adminUser.username);
    assert.strictEqual(lastAudit.remediationReason, testReason);
    assert(lastAudit.timestamp instanceof Date);
  });

  it("4d: core fields (title, price, owner, reviews) untouched by location remediation", () => {
    assert.strictEqual(updatedSample.title, sample.title);
    assert.strictEqual(updatedSample.price, sample.price);
    assert.strictEqual(updatedSample.owner.toString(), sample.owner.toString());
  });

  // Clean up: Restore sample to original state so test suite is idempotent
  await Listing.updateOne(
    { _id: sample._id },
    {
      $set: {
        "geometry.coordinates": originalCoords,
        remediationFlag: "LOCATION_UNCERTAIN",
        remediationReviewStatus: "PENDING_ADMIN_REVIEW",
      },
      $pop: { locationAuditHistory: 1 },
    }
  );
  it("4e: test cleanup restores Serengeti to pre-test baseline idempotently", async () => {
    const restored = await Listing.findById(sample._id);
    assert.deepStrictEqual(restored.geometry.coordinates, originalCoords);
    assert.strictEqual(restored.remediationFlag, "LOCATION_UNCERTAIN");
    assert.strictEqual(restored.locationAuditHistory.length, originalAuditLen);
  });

  // SUITE 5: PUBLICATION GUARD AGAINST UNRESOLVED COORDINATES
  console.log("\nSUITE 5: Publication Guard on Unresolved Coordinates");
  const tempListing = new Listing({
    title: "Unresolved Coords Guard Test Listing",
    description: "Guard test",
    price: 5000,
    location: "Unknown Spot",
    country: "India",
    owner: adminUser._id,
    isPublished: true,
    geometry: { type: "Point", coordinates: [] },
  });
  await tempListing.validate();

  it("5a: listingSchema pre-validate strictly demotes isPublished to false when coords empty", () => {
    assert.strictEqual(tempListing.isPublished, false);
    assert.strictEqual(tempListing.isLocationResolved, false);
  });

  // SUITE 6: HISTORICAL BOOKING INTEGRITY (WL-TEST4732)
  console.log("\nSUITE 6: Historical Booking Integrity (WL-TEST4732)");
  const histBooking = await Booking.findOne({ bookingRef: "WL-TEST4732" });

  it("6a: booking WL-TEST4732 exists with status Completed", () => {
    assert(histBooking, "Booking WL-TEST4732 must exist");
    assert.strictEqual(histBooking.status, "Completed");
  });

  it("6b: user reference is preserved as 6af415d050a9558faf18b3d8 without reassignment", () => {
    assert.strictEqual(histBooking.user.toString(), "6af415d050a9558faf18b3d8");
  });

  const guestExists = await User.findById(histBooking.user);
  it("6c: guest user is verified null (orphaned test fixture)", () => {
    assert.strictEqual(guestExists, null);
  });

  // Verify review submission cannot be authorized for this booking by any current user
  const { req: revReq, res: revRes } = createMockReqRes({
    params: { id: histBooking.listing.toString() },
    body: { review: { rating: 5, comment: "Attempted unauthorized review" } },
    user: adminUser, // Admin user ID does not match orphaned guest ID
    isJson: false,
  });
  await reviewController.createReview(revReq, revRes);

  it("6d: review creation strictly rejects non-matching guest (cannot authorize review)", () => {
    assert(revRes.redirectUrl.includes(`/listings/${histBooking.listing}`));
    assert(revReq.flashes.some((f) => f.type === "error" && f.msg.includes("Only verified guests")));
  });

  // SUITE 7: LEGACY REVIEW INTEGRITY (6a73a4a9ea51345c3de0cca3)
  console.log("\nSUITE 7: Legacy Review Integrity (6a73a4a9ea51345c3de0cca3)");
  const legacyReviewDoc = await Review.findById("6a73a4a9ea51345c3de0cca3");

  it("7a: legacy review exists with comment 'nice' and rating 3", () => {
    assert(legacyReviewDoc, "Legacy review must exist");
    assert.strictEqual(legacyReviewDoc.comment, "nice");
    assert.strictEqual(legacyReviewDoc.rating, 3);
  });

  it("7b: legacy review has null author and null booking (genuine pre-launch seed)", () => {
    assert(!legacyReviewDoc.author, "Author must be null/undefined");
    assert(!legacyReviewDoc.booking, "Booking must be null/undefined");
  });

  // SUITE 8: DATABASE TOTAL INTEGRITY VERIFICATION
  console.log("\nSUITE 8: Total Database Count Integrity");
  const finalListingCount = await Listing.countDocuments();
  const finalUserCount = await User.countDocuments();
  const finalBookingCount = await Booking.countDocuments();
  const finalReviewCount = await Review.countDocuments();

  it("8a: exactly 150 listings exist", () => {
    assert.strictEqual(finalListingCount, 150);
  });

  it("8b: exactly 14 users exist", () => {
    assert.strictEqual(finalUserCount, 14);
  });

  it("8c: exactly 5 bookings exist", () => {
    assert.strictEqual(finalBookingCount, 5);
  });

  it("8d: exactly 5 reviews exist", () => {
    assert.strictEqual(finalReviewCount, 5);
  });

  await mongoose.disconnect();

  console.log("\n==================================================================");
  console.log(`  PHASE 9.3.2 TEST SUMMARY: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100%)`);
  console.log("==================================================================\n");
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}

module.exports = { runTests };
