require("dotenv").config();
const http = require("http");
const https = require("https");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const User = require("./models/user.js");
const Listing = require("./models/listing.js");
const Booking = require("./models/booking.js");
const Review = require("./models/review.js");
const {
  autoUpdateCompletedBookings,
  startBookingLifecycleScheduler,
  stopBookingLifecycleScheduler,
} = require("./utils/bookingLifecycle.js");

function toFormData(obj, prefix = "") {
  const parts = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      const formKey = prefix ? `${prefix}[${key}]` : key;
      if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
        parts.push(toFormData(val, formKey));
      } else if (Array.isArray(val)) {
        val.forEach((item) => {
          parts.push(`${encodeURIComponent(formKey)}=${encodeURIComponent(item)}`);
        });
      } else {
        parts.push(`${encodeURIComponent(formKey)}=${encodeURIComponent(val == null ? "" : val)}`);
      }
    }
  }
  return parts.filter(Boolean).join("&");
}

function buildMultipart(fields, files = []) {
  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  const chunks = [];
  for (const [key, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
      )
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.content);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    boundary,
    data: Buffer.concat(chunks),
  };
}

function request(options, postData = null, cookie = "", customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: "127.0.0.1",
      port: 8080,
      path: options.path,
      method: options.method || "GET",
      headers: { ...(options.headers || {}), ...customHeaders },
    };

    if (cookie) {
      reqOptions.headers["Cookie"] = cookie;
    }

    let body = "";
    if (postData) {
      if (Buffer.isBuffer(postData) || customHeaders["Content-Type"]) {
        body = postData;
      } else {
        body = typeof postData === "string" ? postData : toFormData(postData);
        if (!reqOptions.headers["Content-Type"]) {
          reqOptions.headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
      }
      reqOptions.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let setCookie = res.headers["set-cookie"];
        let cookieStr = "";
        if (setCookie) {
          cookieStr = Array.isArray(setCookie)
            ? setCookie.map((c) => c.split(";")[0]).join("; ")
            : setCookie.split(";")[0];
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          cookie: cookieStr || cookie,
        });
      });
    });

    req.on("error", (e) => reject(e));
    if (postData) req.write(body);
    req.end();
  });
}

async function runProductionReadinessCheck() {
  console.log("==================================================================");
  console.log("       WANDERLUST FINAL PRODUCTION READINESS VERIFICATION         ");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;
  const testResults = [];

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
      testResults.push({ name: testName, status: "PASS", details });
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
      testResults.push({ name: testName, status: "FAIL", details });
    }
  }

  await mongoose.connect("mongodb://127.0.0.1:27017/wanderlust");

  // Step 0: Record baseline database state
  const baseListingCount = await Listing.countDocuments();
  const baseUserCount = await User.countDocuments();
  const baseBookingCount = await Booking.countDocuments();
  const baseReviewCount = await Review.countDocuments();

  console.log(`\n[Baseline Check] Listings: ${baseListingCount}, Users: ${baseUserCount}, Bookings: ${baseBookingCount}, Reviews: ${baseReviewCount}`);

  try {
    // -------------------------------------------------------------------------
    // CHECK 1: RECURRING SCHEDULER AUTO-COMPLETION WITHOUT HTTP REQUESTS
    // -------------------------------------------------------------------------
    console.log("\n--- CHECK 1: SCHEDULER AUTO-COMPLETION & RECURRENCE ---");

    const sampleListing = await Listing.findOne({ status: "approved" });
    const sampleUser = await User.findOne({ role: "user" }) || await User.findOne({});

    const pastCheckoutDate = new Date(Date.now() - 2 * 86400000); // 2 days ago
    const checkInDate = new Date(Date.now() - 5 * 86400000); // 5 days ago

    // 1a. Confirmed booking past checkout
    const confirmedPastBooking = new Booking({
      bookingRef: `WL-SCHED-CONF-${Date.now().toString().slice(-4)}`,
      listing: sampleListing._id,
      user: sampleUser._id,
      checkIn: checkInDate,
      checkOut: pastCheckoutDate,
      totalGuests: 1,
      totalNights: 3,
      basePrice: 3000,
      tax: 540,
      totalPrice: 3540,
      status: "Confirmed",
    });
    await confirmedPastBooking.save();

    // 1b. Start recurring scheduler with a 250ms interval to verify timer-driven execution
    startBookingLifecycleScheduler(250);

    // Sleep 600ms without making ANY http request to the server
    await new Promise((r) => setTimeout(r, 600));

    // Stop recurring scheduler
    stopBookingLifecycleScheduler();

    const transitionedBooking = await Booking.findById(confirmedPastBooking._id);
    assert(
      transitionedBooking.status === "Completed",
      "Confirmed booking transitioned to Completed purely via background scheduler (no HTTP request)"
    );

    // -------------------------------------------------------------------------
    // CHECK 2: SCHEDULER PRESERVES CANCELLED, REJECTED, AND PENDING BOOKINGS
    // -------------------------------------------------------------------------
    console.log("\n--- CHECK 2: SCHEDULER STATUS IMMUTABILITY (CANCELLED / REJECTED) ---");

    // Cancelled booking with past checkout
    const cancelledPastBooking = new Booking({
      bookingRef: `WL-SCHED-CANC-${Date.now().toString().slice(-4)}`,
      listing: sampleListing._id,
      user: sampleUser._id,
      checkIn: checkInDate,
      checkOut: pastCheckoutDate,
      totalGuests: 1,
      totalNights: 3,
      basePrice: 3000,
      tax: 540,
      totalPrice: 3540,
      status: "Cancelled",
    });
    await cancelledPastBooking.save();

    // Rejected booking with past checkout
    const rejectedPastBooking = new Booking({
      bookingRef: `WL-SCHED-REJ-${Date.now().toString().slice(-4)}`,
      listing: sampleListing._id,
      user: sampleUser._id,
      checkIn: checkInDate,
      checkOut: pastCheckoutDate,
      totalGuests: 1,
      totalNights: 3,
      basePrice: 3000,
      tax: 540,
      totalPrice: 3540,
      status: "Rejected",
    });
    await rejectedPastBooking.save();

    // Pending booking with past checkout
    const pendingPastBooking = new Booking({
      bookingRef: `WL-SCHED-PEND-${Date.now().toString().slice(-4)}`,
      listing: sampleListing._id,
      user: sampleUser._id,
      checkIn: checkInDate,
      checkOut: pastCheckoutDate,
      totalGuests: 1,
      totalNights: 3,
      basePrice: 3000,
      tax: 540,
      totalPrice: 3540,
      status: "Pending",
    });
    await pendingPastBooking.save();

    // Execute lifecycle update
    await autoUpdateCompletedBookings();

    const postCheckCancelled = await Booking.findById(cancelledPastBooking._id);
    assert(
      postCheckCancelled.status === "Cancelled",
      "Scheduler strictly preserves Cancelled bookings (remains Cancelled after checkout)"
    );

    const postCheckRejected = await Booking.findById(rejectedPastBooking._id);
    assert(
      postCheckRejected.status === "Rejected",
      "Scheduler strictly preserves Rejected bookings (remains Rejected after checkout)"
    );

    const postCheckPending = await Booking.findById(pendingPastBooking._id);
    assert(
      postCheckPending.status === "Pending",
      "Scheduler strictly preserves Pending bookings (never auto-completes unconfirmed bookings)"
    );

    // -------------------------------------------------------------------------
    // CHECK 3: SERVER RESTART BEHAVIOR SIMULATION
    // -------------------------------------------------------------------------
    console.log("\n--- CHECK 3: SERVER BOOT / RESTART BEHAVIOR ---");

    // Simulate server being offline while a Confirmed booking passes its checkout
    const offlinePastBooking = new Booking({
      bookingRef: `WL-SCHED-BOOT-${Date.now().toString().slice(-4)}`,
      listing: sampleListing._id,
      user: sampleUser._id,
      checkIn: checkInDate,
      checkOut: pastCheckoutDate,
      totalGuests: 1,
      totalNights: 3,
      basePrice: 3000,
      tax: 540,
      totalPrice: 3540,
      status: "Confirmed",
    });
    await offlinePastBooking.save();

    // Simulate server boot initialization (app.js calls startBookingLifecycleScheduler on boot)
    await autoUpdateCompletedBookings();
    const postBootBooking = await Booking.findById(offlinePastBooking._id);

    assert(
      postBootBooking.status === "Completed",
      "Server boot reconciliation immediately transitions pending past stays without user visits"
    );

    // Clean up temporary scheduler test bookings
    await Booking.deleteMany({
      _id: {
        $in: [
          confirmedPastBooking._id,
          cancelledPastBooking._id,
          rejectedPastBooking._id,
          pendingPastBooking._id,
          offlinePastBooking._id,
        ],
      },
    });

    // -------------------------------------------------------------------------
    // CHECK 4: MAPBOX CONFIGURATION & RESILIENCY
    // -------------------------------------------------------------------------
    console.log("\n--- CHECK 4: MAPBOX CONFIGURATION & RESILIENCY ---");

    const envMapToken = process.env.MAP_TOKEN || "";
    assert(
      envMapToken.startsWith("pk.eyJ"),
      "MAP_TOKEN in .env is configured with genuine Mapbox public token format (pk.eyJ...)"
    );

    const showEjsPath = path.join(__dirname, "views", "listings", "show.ejs");
    const showEjsContent = fs.readFileSync(showEjsPath, "utf8");
    assert(
      showEjsContent.includes('const mapToken = "<%= mapToken || process.env.MAP_TOKEN || \'\' %>";'),
      "show.ejs properly passes mapToken into client-side context"
    );

    const mapJsPath = path.join(__dirname, "public", "js", "map.js");
    const mapJsContent = fs.readFileSync(mapJsPath, "utf8");
    assert(
      mapJsContent.includes("mapboxgl.accessToken = token;") &&
        mapJsContent.includes("mapbox://styles/mapbox/streets-v12"),
      "public/js/map.js configures streets-v12 style with valid mapboxgl instance"
    );

    // -------------------------------------------------------------------------
    // CHECK 5: CLOUDINARY LIVE CDN & LOCAL FALLBACK PATHS
    // -------------------------------------------------------------------------
    console.log("\n--- CHECK 5: CLOUDINARY & LOCAL IMAGE FALLBACK ---");

    const cloudinaryListings = await Listing.find({ "image.url": { $regex: "cloudinary.com" } }).limit(3);
    assert(cloudinaryListings.length > 0, "Cloudinary listings exist in database");

    function checkHttpUrl(targetUrl) {
      return new Promise((resolve) => {
        const client = targetUrl.startsWith("https") ? https : http;
        client
          .get(targetUrl, (res) => {
            resolve(res.statusCode);
          })
          .on("error", () => resolve(500));
      });
    }

    if (cloudinaryListings.length > 0) {
      const cdnStatus = await checkHttpUrl(cloudinaryListings[0].image.url);
      assert(cdnStatus === 200, `Cloudinary image CDN URL returns HTTP 200 OK (${cloudinaryListings[0].image.url.slice(0, 50)}...)`);
    }

    const appJsContent = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    assert(
      appJsContent.includes('app.use("/uploads"'),
      "Static middleware for /uploads path is configured in app.js for local fallback storage"
    );

    // -------------------------------------------------------------------------
    // CHECK 6: RE-VERIFY AUTH, PROFILE, LISTING APPROVAL, BOOKING & REVIEWS
    // -------------------------------------------------------------------------
    console.log("\n--- CHECK 6: END-TO-END FLOW RE-VERIFICATION ---");

    // 6a. Admin Login
    const adminLoginRes = await request(
      { path: "/admin/login", method: "POST" },
      { username: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    );
    assert(
      adminLoginRes.statusCode === 302 && adminLoginRes.headers.location === "/admin/dashboard",
      "Admin login authenticates successfully and redirects to /admin/dashboard"
    );
    const adminCookie = adminLoginRes.cookie;

    // 6b. User Registration (Guest)
    const testGuestEmail = `readiness_guest_${Date.now()}@test.com`;
    const guestRegRes = await request(
      { path: "/signup", method: "POST" },
      {
        fullName: "Readiness Test Guest",
        email: testGuestEmail,
        mobile: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: "ReadinessPass@2026",
        confirmPassword: "ReadinessPass@2026",
      }
    );
    assert(guestRegRes.statusCode === 302, "Guest user registration succeeds and redirects");
    const guestCookie = guestRegRes.cookie;
    const guestUserDoc = await User.findOne({ email: testGuestEmail });

    // 6c. User Registration (Host)
    const testHostEmail = `readiness_host_${Date.now()}@test.com`;
    const hostRegRes = await request(
      { path: "/signup", method: "POST" },
      {
        fullName: "Readiness Test Host",
        email: testHostEmail,
        mobile: `97${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: "ReadinessPass@2026",
        confirmPassword: "ReadinessPass@2026",
      }
    );
    assert(hostRegRes.statusCode === 302, "Host user registration succeeds and redirects");
    const hostUserDoc = await User.findOne({ email: testHostEmail });

    // 6d. Profile Edit (using multipart)
    const updatedUserName = "Readiness Verified Guest";
    const mpProfile = buildMultipart({ fullName: updatedUserName, email: testGuestEmail, mobile: "9876543210" });
    const editProfileRes = await request(
      { path: "/profile?_method=PUT", method: "POST" },
      mpProfile.data,
      guestCookie,
      { "Content-Type": `multipart/form-data; boundary=${mpProfile.boundary}` }
    );
    assert(editProfileRes.statusCode === 302, "Profile update executes and redirects to /profile");
    const updatedGuestDoc = await User.findById(guestUserDoc._id);
    assert(updatedGuestDoc && updatedGuestDoc.fullName === updatedUserName, "Profile name update persisted accurately in database");

    // 6e. Host Listing Creation & Admin Approval
    const testListingObj = new Listing({
      title: "Readiness Certification Villa",
      description: "Scenic waterfront villa for final production readiness inspection.",
      location: "Baga, Goa",
      country: "India",
      address: "Baga Beach Rd",
      city: "Baga",
      state: "Goa",
      price: 8500,
      maxGuests: 4,
      category: "Amazing Pools",
      propertyType: "Villa",
      owner: hostUserDoc._id, // Owned by Host
      status: "pending",
      isPublished: false,
      geometry: { type: "Point", coordinates: [73.75, 15.55] },
      isLocationResolved: true,
    });
    await testListingObj.save();

    const approveListingRes = await request(
      { path: `/admin/listings/${testListingObj._id}/approve?_method=PATCH`, method: "POST" },
      null,
      adminCookie
    );
    assert(approveListingRes.statusCode === 302, "Admin approves pending property successfully");
    const approvedListingDoc = await Listing.findById(testListingObj._id);
    assert(
      approvedListingDoc.status === "approved" && approvedListingDoc.isPublished === true,
      "Approved property status is 'approved' and isPublished is true"
    );

    // 6f. Booking Creation by Guest & Admin Management
    const futureIn = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    const futureOut = new Date(Date.now() + 13 * 86400000).toISOString().split("T")[0];
    const bookRes = await request(
      { path: `/listings/${testListingObj._id}/bookings`, method: "POST" },
      {
        booking: {
          checkIn: futureIn,
          checkOut: futureOut,
          totalGuests: 2,
        },
      },
      guestCookie // Booked by Guest
    );
    assert(bookRes.statusCode === 302, "Booking request submitted and redirected to /bookings");

    const createdBookingDoc = await Booking.findOne({ listing: testListingObj._id, user: guestUserDoc._id });
    assert(createdBookingDoc && createdBookingDoc.status === "Pending", "Booking created in Pending state");

    const adminApproveBookingRes = await request(
      { path: `/admin/bookings/${createdBookingDoc._id}/approve?_method=PATCH`, method: "POST" },
      null,
      adminCookie
    );
    assert(adminApproveBookingRes.statusCode === 302, "Admin approved booking request successfully");

    const confirmedBookingDoc = await Booking.findById(createdBookingDoc._id);
    assert(confirmedBookingDoc.status === "Confirmed", "Booking status successfully transitioned to Confirmed");

    // 6g. Verified Review Security Check (Uncompleted stay cannot review)
    await request(
      { path: `/listings/${testListingObj._id}/reviews`, method: "POST" },
      { "review[rating]": 5, "review[comment]": "Premature review before completion" },
      guestCookie
    );
    const prematureReviewDoc = await Review.findOne({ listing: testListingObj._id, author: guestUserDoc._id });
    assert(!prematureReviewDoc, "Confirmed booking before checkout cannot submit a review");

    // Transition booking to completed to test legitimate verified review
    confirmedBookingDoc.status = "Completed";
    await confirmedBookingDoc.save();

    await request(
      { path: `/listings/${testListingObj._id}/reviews`, method: "POST" },
      { "review[rating]": 5, "review[comment]": "Superb completed stay experience!" },
      guestCookie
    );
    const legitimateReviewDoc = await Review.findOne({ listing: testListingObj._id, author: guestUserDoc._id });
    assert(legitimateReviewDoc !== null, "Completed verified stay allowed to submit review");
    assert(legitimateReviewDoc.isVerifiedStay === true, "Review correctly marked with isVerifiedStay: true");

    // Clean up test data created in Check 6
    await Review.deleteMany({ listing: testListingObj._id });
    await Booking.deleteMany({ listing: testListingObj._id });
    await Listing.deleteOne({ _id: testListingObj._id });
    await User.deleteMany({ _id: { $in: [guestUserDoc._id, hostUserDoc._id] } });

    // -------------------------------------------------------------------------
    // CHECK 7: DATABASE INTEGRITY RECONCILIATION
    // -------------------------------------------------------------------------
    console.log("\n--- CHECK 7: DATABASE RECORD INTEGRITY ---");
    const endListingCount = await Listing.countDocuments();
    const endUserCount = await User.countDocuments();
    const endBookingCount = await Booking.countDocuments();
    const endReviewCount = await Review.countDocuments();

    assert(
      endListingCount === baseListingCount,
      `Listing records preserved (Baseline: ${baseListingCount}, Current: ${endListingCount})`
    );
    assert(
      endUserCount === baseUserCount,
      `User records preserved (Baseline: ${baseUserCount}, Current: ${endUserCount})`
    );
    assert(
      endBookingCount === baseBookingCount,
      `Booking records preserved (Baseline: ${baseBookingCount}, Current: ${endBookingCount})`
    );
    assert(
      endReviewCount === baseReviewCount,
      `Review records preserved (Baseline: ${baseReviewCount}, Current: ${endReviewCount})`
    );

    console.log("\n==================================================================");
    console.log(`PRODUCTION READINESS CHECK COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================================");
  } finally {
    await mongoose.disconnect();
  }

  return { passed, failed, testResults };
}

runProductionReadinessCheck()
  .then((res) => {
    if (res.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
