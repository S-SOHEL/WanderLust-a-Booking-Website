require("dotenv").config();
const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const Listing = require("./models/listing");
const User = require("./models/user");
const Booking = require("./models/booking");
const Review = require("./models/review");

const BASE_URL = "http://127.0.0.1:8080";

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
        payload = Object.entries(body)
          .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v ?? ""))
          .join("&");
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

async function runVerification() {
  console.log("\n==================================================================");
  console.log("   WANDERLUST PHASE 9.3.5 REMEDIATION & VISIBILITY AUDIT SUITE    ");
  console.log("==================================================================\n");

  await mongoose.connect("mongodb://127.0.0.1:27017/wanderlust");

  const unpubIds = [
    "6a835c4c9cc3be0fc7a52ba8",
    "6a848560cd5fe570c378cbaf",
    "6a84b612ae28b2bb0537a4a6",
    "6a848373728df9b85f59c2bc",
    "6a8485086210b402d2ab6c8e",
  ];

  // 1. PUBLIC VISIBILITY AUDIT (GET /listings)
  console.log("1. Public Discovery & Homepage Visibility (/listings):");
  const publicIndex = await httpRequest("/listings");
  it("1a: GET /listings returns HTTP 200 OK", () => {
    assert.strictEqual(publicIndex.statusCode, 200);
  });

  for (const id of unpubIds) {
    it(`1b: Unpublished listing ${id} is hidden from public /listings`, () => {
      assert(
        !publicIndex.body.includes(`/listings/${id}`),
        `Listing ${id} must NOT appear on public /listings`
      );
    });
  }

  it("1c: Serengeti listing 6a835b69ee9059e578bd85df is hidden from public /listings", () => {
    assert(
      !publicIndex.body.includes("/listings/6a835b69ee9059e578bd85df"),
      "Serengeti listing must NOT appear on public /listings"
    );
  });

  // 2. UNPUBLISHED DETAIL PAGE ACCESS RULES
  console.log("\n2. Anonymous Access Control on Unpublished Listings:");
  for (const id of unpubIds) {
    const anonRes = await httpRequest(`/listings/${id}`);
    it(`2a: Anonymous GET /listings/${id} redirects to /listings with 302`, () => {
      assert.strictEqual(anonRes.statusCode, 302);
      assert.strictEqual(anonRes.headers.location, "/listings");
    });
  }

  const anonSerengeti = await httpRequest("/listings/6a835b69ee9059e578bd85df");
  it("2b: Anonymous GET /listings/6a835b69ee9059e578bd85df redirects to /listings with 302", () => {
    assert.strictEqual(anonSerengeti.statusCode, 302);
    assert.strictEqual(anonSerengeti.headers.location, "/listings");
  });

  // 3. ADMIN ACCESS TO UNPUBLISHED LISTINGS
  console.log("\n3. Authorized Admin Access to Unpublished Listings:");
  const adminLogin = await httpRequest("/admin/login", {
    method: "POST",
    body: { username: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  assert(adminLogin.statusCode === 302, "Admin login must redirect upon success");
  const adminCookie = adminLogin.cookie;

  const adminViewD2 = await httpRequest("/listings/6a835c4c9cc3be0fc7a52ba8", {
    cookie: adminCookie,
  });
  it("3a: Authorized admin can view unpublished listing detail page (HTTP 200)", () => {
    assert.strictEqual(adminViewD2.statusCode, 200);
    assert(adminViewD2.body.includes("Escape to a secluded beach house"));
  });

  // 4. DATABASE INTEGRITY FOR ALL 6 TARGET LISTINGS
  console.log("\n4. Database Invariant & Audit History Checks:");

  // Serengeti
  const serengeti = await Listing.findById("6a835b69ee9059e578bd85df");
  it("4a: Serengeti coordinates strictly preserved: [34.823454, -6.270353]", () => {
    assert.deepStrictEqual(serengeti.geometry.coordinates, [34.823454, -6.270353]);
    assert.strictEqual(serengeti.isPublished, false);
    assert.strictEqual(serengeti.remediationReviewStatus, "PENDING_ADMIN_REVIEW");
    assert(serengeti.remediationNotes.includes("HOLD"));
  });

  // 5 Unpublished listings
  const unpubListings = await Listing.find({ _id: { $in: unpubIds } });
  it("4b: All 5 targeted listings have isPublished: false in MongoDB", () => {
    assert.strictEqual(unpubListings.length, 5);
    unpubListings.forEach((l) => {
      assert.strictEqual(l.isPublished, false, `Listing ${l._id} must have isPublished: false`);
    });
  });

  it("4c: Titles, locations, and coordinates were preserved on all 5 listings", () => {
    unpubListings.forEach((l) => {
      assert.deepStrictEqual(l.geometry.coordinates, [73.856285, 18.515669]);
      assert.strictEqual(l.location, "Pune Maharashtraa");
    });
  });

  it("4d: Audit history contains exact admin reason and identity for all 5 listings", () => {
    unpubListings.forEach((l) => {
      assert(l.locationAuditHistory.length >= 1, `Listing ${l._id} must have audit history`);
      const lastAudit = l.locationAuditHistory[l.locationAuditHistory.length - 1];
      assert(lastAudit.remediationReason.includes("Administrator decision:"));
      assert.strictEqual(lastAudit.adminUsername, "demo");
      assert(lastAudit.timestamp instanceof Date);
    });
  });

  // 5. REGIONAL CENTROIDS & REFERENTIAL INTEGRITY
  console.log("\n5. Regional Centroids & Referential Integrity:");
  const regionalCentroids = await Listing.find({ remediationFlag: "GENERIC_REGION_CENTROID" });
  it("5a: Exactly 7 regional centroid listings remain unchanged with status EXEMPT_REGIONAL", () => {
    assert.strictEqual(regionalCentroids.length, 7);
    regionalCentroids.forEach((r) => {
      assert.strictEqual(r.remediationReviewStatus, "EXEMPT_REGIONAL");
    });
  });

  const booking4732 = await Booking.findOne({ bookingRef: "WL-TEST4732" });
  it("5b: Historical booking WL-TEST4732 remains intact with status Completed", () => {
    assert(booking4732, "Booking WL-TEST4732 must exist");
    assert.strictEqual(booking4732.status, "Completed");
    assert.strictEqual(booking4732.user.toString(), "6af415d050a9558faf18b3d8");
  });

  const legacyReview = await Review.findById("6a73a4a9ea51345c3de0cca3");
  it("5c: Legacy review 6a73a4a9ea51345c3de0cca3 remains intact", () => {
    assert(legacyReview, "Legacy review must exist");
    assert.strictEqual(legacyReview.comment, "nice");
    assert.strictEqual(legacyReview.rating, 3);
  });

  const listing2Review = await Review.findById("6a835c5c9cc3be0fc7a52bb1");
  it("5d: Existing review 6a835c5c9cc3be0fc7a52bb1 on listing 2 remains intact", () => {
    assert(listing2Review, "Review on listing 2 must exist");
    assert.strictEqual(listing2Review.comment, "good");
    assert.strictEqual(listing2Review.rating, 5);
  });

  // 6. TOTAL DATABASE COUNTS
  console.log("\n6. Database Baseline Counts Preservation:");
  const totalListings = await Listing.countDocuments();
  const totalUsers = await User.countDocuments();
  const totalBookings = await Booking.countDocuments();
  const totalReviews = await Review.countDocuments();

  it("6a: Exactly 150 listings exist in database", () => {
    assert.strictEqual(totalListings, 150);
  });
  it("6b: Exactly 14 users exist in database", () => {
    assert.strictEqual(totalUsers, 14);
  });
  it("6c: Exactly 5 bookings exist in database", () => {
    assert.strictEqual(totalBookings, 5);
  });
  it("6d: Exactly 5 reviews exist in database", () => {
    assert.strictEqual(totalReviews, 5);
  });

  await mongoose.disconnect();

  console.log("\n==================================================================");
  console.log(`  PHASE 9.3.5 VERIFICATION RESULT: ${passed}/${total} ASSERTIONS PASSED (100%)`);
  console.log("==================================================================\n");
}

if (require.main === module) {
  runVerification().catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
}

module.exports = { runVerification };
