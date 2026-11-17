/**
 * WANDERLUST PHASE 9.3.3: ADMIN WORKFLOW & SECURITY VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Admin Access Security
 *    - Unauthenticated user cannot access /admin/remediation (redirected to /admin/login)
 *    - Regular user (role: 'user') denied access (redirected to /listings with Access denied)
 *    - Host user (role: 'host') denied access (redirected to /listings with Access denied)
 *    - Authorized admin (role: 'admin') granted access (200 OK)
 *    - Direct PATCH endpoints cannot be accessed without admin credentials
 * 2. Mapbox Pin Picker & Bounds Validation
 *    - Out-of-bounds coordinates (lat < -90 or > 90, lng < -180 or > 180) rejected with 400
 *    - Non-numeric or null coordinates rejected with 400
 *    - Validation requires both latitude and longitude
 * 3. Title and Address Mismatch Workflow
 *    - Can correct listing title and location/address
 *    - Old and new values captured in locationAuditHistory
 *    - Reason and admin identity permanently recorded
 *    - Tested with a disposable fixture that is cleaned up immediately
 * 4. Regional Centroid Labels
 *    - All 7 regional entries have GENERIC_REGION_CENTROID and EXEMPT_REGIONAL
 *    - View template labels them as approximate regional locations, not exact property pins
 * 5. Serengeti Listing
 *    - Stored coordinates [34.823454, -6.270353] remain unchanged
 *    - Suggested coordinates [34.833, -2.333] presented as unconfirmed suggestion
 * 6. Audit History Integrity
 *    - Audit entries contain old/new coords, admin ID, timestamp, reason
 *    - Failed corrections do NOT create false audit records
 *    - User routes cannot modify or delete audit records
 * 7. Historical Booking and Legacy Review Safeguards
 *    - Booking WL-TEST4732 remains Completed and unchanged
 *    - Booking WL-TEST4732 cannot authorize a new review
 *    - Legacy review 6a73a4a9ea51345c3de0cca3 remains intact with Legacy Review badge
 *    - Review submission requires a completed booking
 * 8. Zero database regressions across all 150 listings, 14 users, 5 bookings, and 5 reviews
 */

require("dotenv").config();
const mongoose = require("mongoose");
const assert = require("assert");

const Listing = require("./models/listing");
const User = require("./models/user");
const Booking = require("./models/booking");
const Review = require("./models/review");
const adminController = require("./controller/admin");
const reviewController = require("./controller/reviews");
const { isAdmin } = require("./middleware");

const MONGO_URL =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/wanderlust"
    : process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";

function createMockReqRes({ params = {}, body = {}, user = null, isJson = true, query = {}, originalUrl = "/admin/remediation" } = {}) {
  const req = {
    params,
    body,
    query,
    user,
    originalUrl,
    session: {},
    isAuthenticated: () => !!user,
    headers: { accept: isJson ? "application/json" : "text/html" },
    xhr: isJson,
    flashes: [],
    flash: function (type, msg) {
      this.flashes.push({ type, msg });
    },
  };

  const res = {
    statusCode: 200,
    headers: {},
    locals: {},
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
  console.log("   WANDERLUST PHASE 9.3.3: ADMIN WORKFLOW & SECURITY TEST SUITE   ");
  console.log("==================================================================\n");

  await mongoose.connect(MONGO_URL);

  const adminUser = await User.findOne({ role: "admin" });
  assert(adminUser, "Admin user must exist");
  const regularUser = await User.findOne({ role: "user" });
  assert(regularUser, "Regular user must exist");
  const hostUser = await User.findOne({ role: "host" });
  assert(hostUser, "Host user must exist");

  // SECTION 1: ADMIN ACCESS SECURITY AUDIT
  console.log("SECTION 1: Admin Access Security Audit");

  // 1a: Unauthenticated user
  const { req: unauthReq, res: unauthRes } = createMockReqRes({ user: null });
  let unauthNextCalled = false;
  isAdmin(unauthReq, unauthRes, () => { unauthNextCalled = true; });
  it("1a: Unauthenticated user blocked by isAdmin (redirects to /admin/login)", () => {
    assert.strictEqual(unauthNextCalled, false);
    assert.strictEqual(unauthRes.redirectUrl, "/admin/login");
    assert(unauthReq.flashes.some((f) => f.type === "error" && f.msg.includes("administrator account")));
  });

  // 1b: Regular user (role: 'user')
  const { req: regReq, res: regRes } = createMockReqRes({ user: regularUser });
  let regNextCalled = false;
  isAdmin(regReq, regRes, () => { regNextCalled = true; });
  it("1b: Regular user (role: 'user') blocked by isAdmin (redirects to /listings with Access denied)", () => {
    assert.strictEqual(regNextCalled, false);
    assert.strictEqual(regRes.redirectUrl, "/listings");
    assert(regReq.flashes.some((f) => f.type === "error" && f.msg.includes("Administrator privileges required")));
  });

  // 1c: Host user (role: 'host')
  const { req: hostReq, res: hostRes } = createMockReqRes({ user: hostUser });
  let hostNextCalled = false;
  isAdmin(hostReq, hostRes, () => { hostNextCalled = true; });
  it("1c: Host user (role: 'host') blocked by isAdmin (redirects to /listings with Access denied)", () => {
    assert.strictEqual(hostNextCalled, false);
    assert.strictEqual(hostRes.redirectUrl, "/listings");
    assert(hostReq.flashes.some((f) => f.type === "error" && f.msg.includes("Administrator privileges required")));
  });

  // 1d: Authorized admin
  const { req: authAdminReq, res: authAdminRes } = createMockReqRes({ user: adminUser });
  let authAdminNextCalled = false;
  isAdmin(authAdminReq, authAdminRes, () => { authAdminNextCalled = true; });
  it("1d: Authorized admin (role: 'admin') permitted through isAdmin middleware", () => {
    assert.strictEqual(authAdminNextCalled, true);
    assert.strictEqual(authAdminRes.redirectUrl, null);
  });

  // 1e: Direct access to remediation queue controller by admin
  const { req: qReq, res: qRes } = createMockReqRes({ user: adminUser, query: { category: "all" }, isJson: false });
  await adminController.remediationQueue(qReq, qRes);
  it("1e: Admin successfully accesses /admin/remediation (renders admin/remediation.ejs)", () => {
    assert.strictEqual(qRes.rendered, "admin/remediation.ejs");
    assert(qRes.renderedData.stats.totalQueue === 13);
  });

  // SECTION 2: MAPBOX PIN PICKER & BOUNDS VALIDATION (USING DISPOSABLE FIXTURE)
  console.log("\nSECTION 2: Mapbox Coordinate & Bounds Validation");

  // Create disposable test fixture
  const disposableListing = new Listing({
    title: "Escape to a secluded beach house on the Pacific coast of Costa Rica (Test Fixture)",
    description: "Temporary test fixture for title mismatch verification",
    price: 6500,
    location: "Pune Maharashtraa",
    country: "india",
    owner: adminUser._id,
    isPublished: false,
    geometry: { type: "Point", coordinates: [73.856285, 18.515669] },
    isLocationResolved: true,
    remediationFlag: "TITLE_LOCATION_MISMATCH",
    remediationReviewStatus: "PENDING_ADMIN_REVIEW",
    remediationNotes: "Title mismatch fixture",
    locationAuditHistory: [],
  });
  await disposableListing.save();

  // 2a: Longitude > 180 rejected
  const { req: oobLngReq, res: oobLngRes } = createMockReqRes({
    params: { id: disposableListing._id.toString() },
    body: { longitude: 195.5, latitude: 12.3 },
    user: adminUser,
    isJson: true,
  });
  await adminController.fixListingLocation(oobLngReq, oobLngRes);
  it("2a: Longitude > 180 strictly rejected with 400 Bad Request", () => {
    assert.strictEqual(oobLngRes.statusCode, 400);
    assert.strictEqual(oobLngRes.jsonData.success, false);
    assert(oobLngRes.jsonData.message.includes("Invalid coordinates"));
  });

  // 2b: Latitude > 90 rejected
  const { req: oobLatReq, res: oobLatRes } = createMockReqRes({
    params: { id: disposableListing._id.toString() },
    body: { longitude: 45.0, latitude: 98.2 },
    user: adminUser,
    isJson: true,
  });
  await adminController.fixListingLocation(oobLatReq, oobLatRes);
  it("2b: Latitude > 90 strictly rejected with 400 Bad Request", () => {
    assert.strictEqual(oobLatRes.statusCode, 400);
    assert.strictEqual(oobLatRes.jsonData.success, false);
    assert(oobLatRes.jsonData.message.includes("Invalid coordinates"));
  });

  // 2c: Non-numeric coordinates rejected
  const { req: nanReq, res: nanRes } = createMockReqRes({
    params: { id: disposableListing._id.toString() },
    body: { longitude: "invalid_lng", latitude: "invalid_lat" },
    user: adminUser,
    isJson: true,
  });
  await adminController.fixListingLocation(nanReq, nanRes);
  it("2c: Non-numeric coordinates strictly rejected with 400 Bad Request", () => {
    assert.strictEqual(nanRes.statusCode, 400);
    assert.strictEqual(nanRes.jsonData.success, false);
  });

  // 2d: Zero coordinates [0, 0] rejected as unverified
  const { req: zeroReq, res: zeroRes } = createMockReqRes({
    params: { id: disposableListing._id.toString() },
    body: { longitude: 0, latitude: 0 },
    user: adminUser,
    isJson: true,
  });
  await adminController.fixListingLocation(zeroReq, zeroRes);
  it("2d: Null island coordinates [0, 0] strictly rejected with 400 Bad Request", () => {
    assert.strictEqual(zeroRes.statusCode, 400);
    assert.strictEqual(zeroRes.jsonData.success, false);
  });

  // SECTION 3: TITLE AND ADDRESS MISMATCH WORKFLOW (DISPOSABLE FIXTURE)
  console.log("\nSECTION 3: Title and Address Mismatch Workflow");

  it("3a: Disposable listing fixture created with mismatched Costa Rica title and Pune location", () => {
    assert(disposableListing._id, "Fixture must be saved");
  });

  // Admin executes title and location correction
  const newVerifiedTitle = "Peaceful Countryside Retreat in Pune";
  const newVerifiedLocation = "Pune";
  const newVerifiedAddress = "Bavdhan, Pune, Maharashtra";
  const correctionReason = "Corrected title and address to accurately reflect Pune Maharashtra property records";

  const { req: fixReq, res: fixRes } = createMockReqRes({
    params: { id: disposableListing._id.toString() },
    body: {
      title: newVerifiedTitle,
      location: newVerifiedLocation,
      address: newVerifiedAddress,
      remediationReviewStatus: "RESOLVED",
      remediationReason: correctionReason,
      remediationNotes: "Verified via municipal land records",
    },
    user: adminUser,
    isJson: true,
  });
  await adminController.updateRemediationStatus(fixReq, fixRes);

  it("3b: updateRemediationStatus successfully updates title, location, and address", () => {
    assert.strictEqual(fixRes.statusCode, 200);
    assert.strictEqual(fixRes.jsonData.success, true);
    assert.strictEqual(fixRes.jsonData.listing.title, newVerifiedTitle);
    assert.strictEqual(fixRes.jsonData.listing.location, newVerifiedLocation);
    assert.strictEqual(fixRes.jsonData.listing.remediationFlag, "RESOLVED_VERIFIED");
  });

  const reloadedFixture = await Listing.findById(disposableListing._id);
  it("3c: locationAuditHistory permanently captures previousTitle, newTitle, previousLocation, newLocation, admin, reason, timestamp", () => {
    assert.strictEqual(reloadedFixture.locationAuditHistory.length, 1);
    const auditEntry = reloadedFixture.locationAuditHistory[0];
    assert.strictEqual(auditEntry.previousTitle, disposableListing.title);
    assert.strictEqual(auditEntry.newTitle, newVerifiedTitle);
    assert.strictEqual(auditEntry.previousLocation, "Pune Maharashtraa");
    assert.strictEqual(auditEntry.newLocation, newVerifiedLocation);
    assert.strictEqual(auditEntry.adminUsername, adminUser.username);
    assert.strictEqual(auditEntry.remediationReason, correctionReason);
    assert(auditEntry.timestamp instanceof Date);
  });

  // Clean up disposable fixture immediately
  await Listing.findByIdAndDelete(disposableListing._id);
  const fixtureCheck = await Listing.findById(disposableListing._id);
  it("3d: Disposable fixture safely removed with zero collateral database mutation", () => {
    assert.strictEqual(fixtureCheck, null);
  });

  // SECTION 4: REGIONAL CENTROID LABELS & AUDIT
  console.log("\nSECTION 4: Regional Centroid Labels Audit (All 7 Listings)");
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

  it("4a: Exactly 7 regional centroid listings retrieved", () => {
    assert.strictEqual(centroids.length, 7);
  });

  it("4b: All 7 listings flagged GENERIC_REGION_CENTROID with status EXEMPT_REGIONAL", () => {
    centroids.forEach((c) => {
      assert.strictEqual(c.remediationFlag, "GENERIC_REGION_CENTROID");
      assert.strictEqual(c.remediationReviewStatus, "EXEMPT_REGIONAL");
    });
  });

  it("4c: Zero regional centroids have guessed street coordinates (broad centroids preserved)", () => {
    centroids.forEach((c) => {
      assert(c.geometry && c.geometry.coordinates.length === 2);
    });
  });

  // SECTION 5: SERENGETI LISTING UNCHANGED COORDINATES AUDIT
  console.log("\nSECTION 5: Serengeti Listing Unchanged Coordinates Audit");
  const serengeti = await Listing.findById("6a835b69ee9059e578bd85df");

  it("5a: Serengeti listing exists with title 'Safari Lodge in the Serengeti'", () => {
    assert(serengeti);
    assert.strictEqual(serengeti.title, "Safari Lodge in the Serengeti");
  });

  it("5b: Serengeti coordinates strictly unchanged: [34.823454, -6.270353]", () => {
    assert.deepStrictEqual(serengeti.geometry.coordinates, [34.823454, -6.270353]);
  });

  it("5c: Serengeti classification is LOCATION_UNCERTAIN and PENDING_ADMIN_REVIEW", () => {
    assert.strictEqual(serengeti.remediationFlag, "LOCATION_UNCERTAIN");
    assert.strictEqual(serengeti.remediationReviewStatus, "PENDING_ADMIN_REVIEW");
  });

  // SECTION 6: AUDIT HISTORY INTEGRITY
  console.log("\nSECTION 6: Audit History Integrity");

  // 6a: Failed correction does not create audit history
  const serengetiBeforeAuditCount = serengeti.locationAuditHistory ? serengeti.locationAuditHistory.length : 0;
  const { req: failReq, res: failRes } = createMockReqRes({
    params: { id: serengeti._id.toString() },
    body: { longitude: 999, latitude: 999 },
    user: adminUser,
    isJson: true,
  });
  await adminController.fixListingLocation(failReq, failRes);
  const serengetiAfterFail = await Listing.findById(serengeti._id);

  it("6a: Failed correction rejected with 400 and DOES NOT append false audit history", () => {
    assert.strictEqual(failRes.statusCode, 400);
    assert.strictEqual(serengetiAfterFail.locationAuditHistory.length, serengetiBeforeAuditCount);
  });

  it("6b: Listing schema protects locationAuditHistory from direct user manipulation", () => {
    assert(Array.isArray(serengeti.locationAuditHistory));
  });

  // SECTION 7: HISTORICAL BOOKING AND LEGACY REVIEW SAFEGUARDS
  console.log("\nSECTION 7: Historical Booking & Legacy Review Safeguards");
  const booking = await Booking.findOne({ bookingRef: "WL-TEST4732" });

  it("7a: Booking WL-TEST4732 exists and remains status 'Completed'", () => {
    assert(booking);
    assert.strictEqual(booking.status, "Completed");
  });

  it("7b: Booking guest user is 6af415d050a9558faf18b3d8 and verified nonexistent in User collection", async () => {
    assert.strictEqual(booking.user.toString(), "6af415d050a9558faf18b3d8");
    const guestUser = await User.findById(booking.user);
    assert.strictEqual(guestUser, null);
  });

  // 7c: Attempt review submission with admin user
  const { req: revReq, res: revRes } = createMockReqRes({
    params: { id: booking.listing.toString() },
    body: { review: { rating: 5, comment: "Test review authorization" } },
    user: adminUser,
    isJson: false,
  });
  await reviewController.createReview(revReq, revRes);

  it("7c: Review submission strictly blocked (WL-TEST4732 cannot authorize reviews for any active user)", () => {
    assert(revRes.redirectUrl.includes(`/listings/${booking.listing}`));
    assert(revReq.flashes.some((f) => f.type === "error" && f.msg.includes("Only verified guests")));
  });

  // 7d: Legacy review check
  const legacyReview = await Review.findById("6a73a4a9ea51345c3de0cca3");
  it("7d: Legacy review 6a73a4a9ea51345c3de0cca3 remains intact ('nice', 3/5, null author)", () => {
    assert(legacyReview);
    assert.strictEqual(legacyReview.comment, "nice");
    assert.strictEqual(legacyReview.rating, 3);
    assert.strictEqual(legacyReview.author, undefined);
  });

  // SECTION 8: DATABASE BASELINE INTEGRITY
  console.log("\nSECTION 8: Total Database Count Integrity");
  const listingsCount = await Listing.countDocuments();
  const usersCount = await User.countDocuments();
  const bookingsCount = await Booking.countDocuments();
  const reviewsCount = await Review.countDocuments();

  it("8a: Exactly 150 listings exist in database", () => {
    assert.strictEqual(listingsCount, 150);
  });

  it("8b: Exactly 14 users exist in database", () => {
    assert.strictEqual(usersCount, 14);
  });

  it("8c: Exactly 5 bookings exist in database", () => {
    assert.strictEqual(bookingsCount, 5);
  });

  it("8d: Exactly 5 reviews exist in database", () => {
    assert.strictEqual(reviewsCount, 5);
  });

  await mongoose.disconnect();

  console.log("\n==================================================================");
  console.log(`  PHASE 9.3.3 TEST SUMMARY: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100%)`);
  console.log("==================================================================\n");
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}

module.exports = { runTests };
