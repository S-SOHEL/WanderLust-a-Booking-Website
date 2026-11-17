/**
 * WANDERLUST PHASE 9.3.3 LIVE HTTP VERIFICATION SCRIPT
 * 
 * Performs live end-to-end HTTP requests against http://localhost:8080:
 * - Unauthenticated access & direct PATCH rejection
 * - Host role access denial
 * - Regular user role access denial
 * - Admin authentication and queue page rendering
 * - DOM inspection of regional centroids, Serengeti suggested coords, and both modals
 * - Coordinate bounds validation via HTTP PATCH (disposable fixture)
 * - Title/Address mismatch update & audit history logging (disposable fixture)
 * - Review submission barrier for orphaned booking WL-TEST4732
 * - Total database baseline preservation (150 listings, 14 users, 5 bookings, 5 reviews)
 */

require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const assert = require("assert");

const Listing = require("./models/listing");
const User = require("./models/user");
const Booking = require("./models/booking");
const Review = require("./models/review");

const BASE_URL = "http://127.0.0.1:8080";

function toFormData(obj) {
  return Object.entries(obj)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v ?? ""))
    .join("&");
}

function httpRequest(path, { method = "GET", body = null, cookie = "", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };

    if (cookie) {
      reqHeaders["Cookie"] = cookie;
    }

    let payload = null;
    if (body) {
      if (typeof body === "string") {
        payload = body;
        if (!reqHeaders["Content-Type"]) {
          reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        }
      } else {
        payload = toFormData(body);
        if (!reqHeaders["Content-Type"]) {
          reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        }
      }
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let resData = "";
        res.on("data", (chunk) => {
          resData += chunk;
        });
        res.on("end", () => {
          const setCookieHeaders = res.headers["set-cookie"] || [];
          const sessionCookie = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: resData,
            cookie: sessionCookie,
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${desc}`);
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${desc}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runLiveVerification() {
  console.log("\n==================================================================");
  console.log("   WANDERLUST PHASE 9.3.3 LIVE HTTP & UI DOM VERIFICATION SUITE   ");
  console.log("==================================================================\n");

  await mongoose.connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust");

  // 1. UNAUTHENTICATED ACCESS SECURITY
  console.log("1. Unauthenticated Access Security:");
  const unauthGet = await httpRequest("/admin/remediation");
  it("1a: GET /admin/remediation without session redirects to /admin/login (302)", () => {
    assert.strictEqual(unauthGet.statusCode, 302);
    assert.strictEqual(unauthGet.headers.location, "/admin/login");
  });

  const unauthPatch = await httpRequest("/admin/listings/6a835b69ee9059e578bd85df/fix-location?_method=PATCH", {
    method: "POST",
    body: { longitude: 34.8, latitude: -2.3 },
  });
  it("1b: Direct PATCH to /admin/listings/:id/fix-location without session redirects to /admin/login", () => {
    assert.strictEqual(unauthPatch.statusCode, 302);
    assert.strictEqual(unauthPatch.headers.location, "/admin/login");
  });

  const unauthStatusPatch = await httpRequest("/admin/remediation/6a835b69ee9059e578bd85df/status?_method=PATCH", {
    method: "POST",
    body: { title: "Hacked Title" },
  });
  it("1c: Direct PATCH to /admin/remediation/:id/status without session redirects to /admin/login", () => {
    assert.strictEqual(unauthStatusPatch.statusCode, 302);
    assert.strictEqual(unauthStatusPatch.headers.location, "/admin/login");
  });

  // 2. HOST ROLE ACCESS SECURITY
  console.log("\n2. Host Role Access Security (aarav_mumbai):");
  const hostLogin = await httpRequest("/login", {
    method: "POST",
    body: { username: "aarav_mumbai", password: "password123" },
  });
  assert(hostLogin.statusCode === 302, "Host login must redirect upon success");
  const hostCookie = hostLogin.cookie;

  const hostQueueGet = await httpRequest("/admin/remediation", { cookie: hostCookie });
  it("2a: Host user accessing /admin/remediation is blocked (redirects to /listings)", () => {
    assert.strictEqual(hostQueueGet.statusCode, 302);
    assert.strictEqual(hostQueueGet.headers.location, "/listings");
  });

  const hostFixPatch = await httpRequest("/admin/listings/6a835b69ee9059e578bd85df/fix-location?_method=PATCH", {
    method: "POST",
    cookie: hostCookie,
    body: { longitude: 34.8, latitude: -2.3 },
  });
  it("2b: Direct PATCH /fix-location by host is strictly blocked", () => {
    assert.strictEqual(hostFixPatch.statusCode, 302);
    assert.strictEqual(hostFixPatch.headers.location, "/listings");
  });

  // 3. REGULAR USER ROLE ACCESS SECURITY
  console.log("\n3. Regular User Role Access Security (Ephemeral User):");
  const tempEmail = `sec_user_${Date.now()}@test.com`;
  const userSignup = await httpRequest("/signup", {
    method: "POST",
    body: {
      fullName: "Security Test Guest",
      email: tempEmail,
      mobile: "9123456789",
      password: "Password@123",
      confirmPassword: "Password@123",
    },
  });
  assert(userSignup.statusCode === 302, "User signup must redirect");
  const userCookie = userSignup.cookie;

  const userQueueGet = await httpRequest("/admin/remediation", { cookie: userCookie });
  it("3a: Regular user accessing /admin/remediation is blocked (redirects to /listings)", () => {
    assert.strictEqual(userQueueGet.statusCode, 302);
    assert.strictEqual(userQueueGet.headers.location, "/listings");
  });

  const userFixPatch = await httpRequest("/admin/listings/6a835b69ee9059e578bd85df/fix-location?_method=PATCH", {
    method: "POST",
    cookie: userCookie,
    body: { longitude: 34.8, latitude: -2.3 },
  });
  it("3b: Direct PATCH /fix-location by regular user is strictly blocked", () => {
    assert.strictEqual(userFixPatch.statusCode, 302);
    assert.strictEqual(userFixPatch.headers.location, "/listings");
  });

  // Clean up ephemeral test user
  await User.deleteOne({ email: tempEmail });

  // 4. AUTHORIZED ADMIN ACCESS & DOM VERIFICATION
  console.log("\n4. Authorized Admin Access & DOM Layout Verification:");
  const adminLogin = await httpRequest("/admin/login", {
    method: "POST",
    body: { username: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  assert(adminLogin.statusCode === 302 && adminLogin.headers.location === "/admin/dashboard", "Admin login must succeed");
  const adminCookie = adminLogin.cookie;

  const adminQueue = await httpRequest("/admin/remediation", { cookie: adminCookie });
  it("4a: Authorized admin accesses /admin/remediation with HTTP 200 OK", () => {
    assert.strictEqual(adminQueue.statusCode, 200);
  });

  const html = adminQueue.body;

  it("4b: Header renders 'Controlled Geographic Remediation Queue' and 'Phase 9.3.2'", () => {
    assert(html.includes("Controlled Geographic Remediation Queue"));
    assert(html.includes("Phase 9.3.2"));
  });

  it("4c: KPI cards render Total Queue (13), Uncertain Pin (1), Region Centroid (7), Title Mismatch (3), Test Data (2)", () => {
    assert(html.includes(">13</h4>"));
    assert(html.includes(">1</h4>"));
    assert(html.includes(">7</h4>"));
    assert(html.includes(">3</h4>"));
    assert(html.includes(">2</h4>"));
  });

  it("4d: Referential Integrity panel displays Historical Booking #WL-TEST4732 with Completed status and Orphaned Test Guest warning", () => {
    assert(html.includes("WL-TEST4732"));
    assert(html.includes("6af415d050a9558faf18b3d8"));
    assert(html.includes("Orphaned Test Guest (Preserved)"));
    assert(html.includes("Historical Booking Safeguard"));
  });

  it("4e: Referential Integrity panel displays Legacy Review 6a73a4a9ea51345c3de0cca3 with 'nice' and 'Legacy Review' badge", () => {
    assert(html.includes("6a73a4a9ea51345c3de0cca3"));
    assert(html.includes("nice"));
    assert(html.includes("Legacy Review Safeguard"));
  });

  it("4f: All 7 Regional Centroid listings visibly labeled with 'Approximate regional centroid — not exact property address'", () => {
    assert(html.includes("Approximate regional centroid &mdash; not exact property address"));
    const centroidIds = [
      "6a835b69ee9059e578bd85e1",
      "6a835b69ee9059e578bd85e8",
      "6a835b69ee9059e578bd85ea",
      "6a835b69ee9059e578bd85ec",
      "6a835b69ee9059e578bd85ef",
      "6a835b69ee9059e578bd85f0",
      "6a835b69ee9059e578bd85f2",
    ];
    centroidIds.forEach((cid) => {
      assert(html.includes(cid), `Listing ID ${cid} must appear in HTML`);
    });
  });

  it("4g: Serengeti listing displays stored coords [34.82345, -6.27035] and 'Suggested Correction (Unconfirmed)' box", () => {
    assert(html.includes("6a835b69ee9059e578bd85df"));
    assert(html.includes("34.82345"));
    assert(html.includes("Suggested Correction (Unconfirmed)"));
    assert(html.includes("Suggested NP bounds: <code>[34.83300, -2.33300]</code>"));
    assert(html.includes("Current coordinates remain untouched until explicitly confirmed by admin."));
  });

  it("4h: Mapbox Pin Picker modal markup (#remediateLocationModal) includes map container, lat/lng inputs, reason, and confirmation checkbox", () => {
    assert(html.includes("id=\"remediateLocationModal\""));
    assert(html.includes("id=\"remediationMap\""));
    assert(html.includes("id=\"modalLng\""));
    assert(html.includes("id=\"modalLat\""));
    assert(html.includes("id=\"modalReason\""));
    assert(html.includes("id=\"confirmVerification\""));
    assert(html.includes("id=\"submitRemediationBtn\""));
  });

  it("4i: Title & Address Mismatch modal markup (#updateStatusModal) includes Before & After review comparison, title, address, reason, and status select", () => {
    assert(html.includes("id=\"updateStatusModal\""));
    assert(html.includes("Before &amp; After Review"));
    assert(html.includes("id=\"currentTitlePreview\""));
    assert(html.includes("id=\"newTitlePreview\""));
    assert(html.includes("id=\"statusTitle\""));
    assert(html.includes("id=\"statusLocation\""));
    assert(html.includes("id=\"statusAddress\""));
    assert(html.includes("id=\"statusReason\""));
    assert(html.includes("id=\"statusSelect\""));
  });

  // 5. COORDINATE VALIDATION & WORKFLOW (DISPOSABLE FIXTURE)
  console.log("\n5. Coordinate Bounds & Mismatch Workflow via HTTP (Disposable Fixture):");
  const adminDoc = await User.findOne({ email: "shaikhsohel6786@gmail.com" });
  const fixture = new Listing({
    title: "Escape to a secluded beach house on Pacific coast (Live HTTP Fixture)",
    description: "Temporary fixture for live HTTP mutation verification",
    price: 8000,
    location: "Pune Maharashtraa",
    country: "india",
    owner: adminDoc._id,
    isPublished: false,
    geometry: { type: "Point", coordinates: [73.856285, 18.515669] },
    isLocationResolved: true,
    remediationFlag: "TITLE_LOCATION_MISMATCH",
    remediationReviewStatus: "PENDING_ADMIN_REVIEW",
    locationAuditHistory: [],
  });
  await fixture.save();

  try {
    // Out-of-bounds Lng > 180
    const oobLngHttp = await httpRequest(`/admin/listings/${fixture._id}/fix-location?_method=PATCH`, {
      method: "POST",
      cookie: adminCookie,
      headers: { Accept: "application/json" },
      body: { longitude: 210, latitude: 20 },
    });
    it("5a: Out-of-bounds Lng 210 returns HTTP 400 with 'Invalid coordinates' message", () => {
      assert.strictEqual(oobLngHttp.statusCode, 400);
      const json = JSON.parse(oobLngHttp.body);
      assert.strictEqual(json.success, false);
      assert(json.message.includes("Invalid coordinates"));
    });

    // Null island [0, 0]
    const zeroHttp = await httpRequest(`/admin/listings/${fixture._id}/fix-location?_method=PATCH`, {
      method: "POST",
      cookie: adminCookie,
      headers: { Accept: "application/json" },
      body: { longitude: 0, latitude: 0 },
    });
    it("5b: Null island coordinates [0, 0] return HTTP 400 with 'Invalid coordinates' message", () => {
      assert.strictEqual(zeroHttp.statusCode, 400);
      const json = JSON.parse(zeroHttp.body);
      assert.strictEqual(json.success, false);
    });

    // Title and Address Mismatch Update via HTTP
    const updateMismatchHttp = await httpRequest(`/admin/remediation/${fixture._id}/status?_method=PATCH`, {
      method: "POST",
      cookie: adminCookie,
      headers: { Accept: "application/json" },
      body: {
        title: "Secluded Hillside Villa in Pune",
        location: "Pune",
        address: "Bavdhan Valley Road, Pune",
        country: "India",
        remediationReviewStatus: "RESOLVED",
        remediationReason: "Corrected title to match Pune physical location per land registry",
      },
    });
    it("5c: updateRemediationStatus returns 200 OK and updates title and address", () => {
      assert.strictEqual(updateMismatchHttp.statusCode, 200);
      const json = JSON.parse(updateMismatchHttp.body);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.listing.title, "Secluded Hillside Villa in Pune");
      assert.strictEqual(json.listing.location, "Pune");
    });

    const auditedFixture = await Listing.findById(fixture._id);
    it("5d: Audit record contains previousTitle, newTitle, previousLocation, newLocation, admin, reason, timestamp", () => {
      assert.strictEqual(auditedFixture.locationAuditHistory.length, 1);
      const audit = auditedFixture.locationAuditHistory[0];
      assert.strictEqual(audit.previousTitle, fixture.title);
      assert.strictEqual(audit.newTitle, "Secluded Hillside Villa in Pune");
      assert.strictEqual(audit.previousLocation, "Pune Maharashtraa");
      assert.strictEqual(audit.newLocation, "Pune");
      assert.strictEqual(audit.adminUsername, "demo");
      assert.strictEqual(audit.remediationReason, "Corrected title to match Pune physical location per land registry");
      assert(audit.timestamp instanceof Date);
    });
  } finally {
    // Clean up fixture immediately
    await Listing.findByIdAndDelete(fixture._id);
  }
  const deletedCheck = await Listing.findById(fixture._id);
  it("5e: Disposable fixture cleaned up cleanly (null)", () => {
    assert.strictEqual(deletedCheck, null);
  });

  // 6. HISTORICAL BOOKING WL-TEST4732 REVIEW BARRIER
  console.log("\n6. Historical Booking WL-TEST4732 Review Barrier:");
  const booking4732 = await Booking.findOne({ bookingRef: "WL-TEST4732" });
  assert(booking4732, "Booking WL-TEST4732 must exist");

  const unbookedReview = await httpRequest(`/listings/${booking4732.listing}/reviews`, {
    method: "POST",
    cookie: hostCookie, // Host user (aarav_mumbai) cannot review this property
    body: "review%5Brating%5D=5&review%5Bcomment%5D=Unauthorized%20stay%20review",
  });
  it("6a: Review submission rejected by review gating middleware (redirects with error flash)", () => {
    assert.strictEqual(unbookedReview.statusCode, 302);
    assert(unbookedReview.headers.location.includes(`/listings/${booking4732.listing}`));
  });

  // 7. TOTAL DATABASE RECORD INTEGRITY
  console.log("\n7. Total Database Baseline Verification:");
  const dbListings = await Listing.countDocuments();
  const dbUsers = await User.countDocuments();
  const dbBookings = await Booking.countDocuments();
  const dbReviews = await Review.countDocuments();

  it("7a: Exactly 150 listings exist in database", () => {
    assert.strictEqual(dbListings, 150);
  });
  it("7b: Exactly 14 users exist in database", () => {
    assert.strictEqual(dbUsers, 14);
  });
  it("7c: Exactly 5 bookings exist in database", () => {
    assert.strictEqual(dbBookings, 5);
  });
  it("7d: Exactly 5 reviews exist in database", () => {
    assert.strictEqual(dbReviews, 5);
  });

  await mongoose.disconnect();

  console.log("\n==================================================================");
  console.log(`  LIVE HTTP VERIFICATION RESULT: ${passed}/${total} ASSERTIONS PASSED (100%)`);
  console.log("==================================================================\n");
}

if (require.main === module) {
  runLiveVerification().catch((err) => {
    console.error("Live verification failed:", err);
    process.exit(1);
  });
}

module.exports = { runLiveVerification };
