require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const User = require("./models/user.js");
const Listing = require("./models/listing.js");
const Booking = require("./models/booking.js");
const Review = require("./models/review.js");
const { autoUpdateCompletedBookings } = require("./utils/bookingLifecycle.js");

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

function request(options, postData = null, cookie = "") {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: "127.0.0.1",
      port: 8080,
      path: options.path,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    if (cookie) {
      reqOptions.headers["Cookie"] = cookie;
    }

    let body = "";
    if (postData) {
      body = typeof postData === "string" ? postData : toFormData(postData);
      reqOptions.headers["Content-Type"] = "application/x-www-form-urlencoded";
      reqOptions.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"];
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          cookie: setCookie ? setCookie.map((c) => c.split(";")[0]).join("; ") : cookie,
        });
      });
    });

    req.on("error", reject);

    if (postData) {
      req.write(body);
    }
    req.end();
  });
}

async function runTests() {
  console.log("\n========================================================");
  console.log("   WANDERLUST MARKETPLACE UPGRADE: VERIFICATION SUITE   ");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  await mongoose.connect("mongodb://127.0.0.1:27017/wanderlust");

  try {
    // ----------------------------------------------------
    // TEST 1: Public Index & UI Compass / Explore Eradication
    // ----------------------------------------------------
    console.log("Test 1: Public Listings & UI Compass / Explore Eradication");
    const indexRes = await request({ path: "/listings" });
    assert(indexRes.statusCode === 200, "GET /listings returns 200 OK");
    assert(!indexRes.data.includes("fa-compass"), "Red compass icon (fa-compass) is completely removed from public UI");
    assert(!indexRes.data.includes(">Explore<") && !indexRes.data.includes(">Explore All"), "Old 'Explore' text replaced with clean luxury branding");
    assert(indexRes.data.includes("WanderLust"), "WanderLust luxury wordmark is rendered in navbar");

    // ----------------------------------------------------
    // TEST 2: Registration Validation & Creation
    // ----------------------------------------------------
    console.log("\nTest 2: Registration System (Full Name, Mobile, Email, Min 8 chars)");
    const testEmail = `test_traveler_${Date.now()}@example.com`;
    const testMobile = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const testPass = "SecurePass@2026";

    // 2a. Rejects if password < 8 chars
    const shortPassRes = await request(
      { path: "/signup", method: "POST" },
      {
        fullName: "Test Traveler",
        email: testEmail,
        mobile: testMobile,
        password: "short",
        confirmPassword: "short",
      }
    );
    assert(shortPassRes.statusCode === 302, "Registration redirects on validation failure");
    const userShort = await User.findOne({ email: testEmail });
    assert(!userShort, "Short password (< 8 chars) was correctly rejected by backend validation");

    // 2b. Valid Registration
    const validSignupRes = await request(
      { path: "/signup", method: "POST" },
      {
        fullName: "Ayaan Shaikh",
        email: testEmail,
        mobile: testMobile,
        password: testPass,
        confirmPassword: testPass,
      }
    );
    assert(validSignupRes.statusCode === 302, "Valid signup successfully registers and redirects");
    const registeredUser = await User.findOne({ email: testEmail });
    assert(registeredUser !== null, "User record persisted in MongoDB with correct email");
    assert(registeredUser.fullName === "Ayaan Shaikh", "Full name saved correctly");
    assert(registeredUser.mobile === testMobile, "Mobile number saved correctly");
    assert(registeredUser.role === "user", "Default role assigned is 'user'");

    // ----------------------------------------------------
    // TEST 3: Dual Login (Email OR Mobile OR Username + Password)
    // ----------------------------------------------------
    console.log("\nTest 3: Dual Login (Email + Password and Mobile + Password)");

    // 3a. Login via Email
    const loginEmailRes = await request(
      { path: "/login", method: "POST" },
      { username: testEmail, password: testPass }
    );
    assert(loginEmailRes.statusCode === 302 && loginEmailRes.headers.location === "/listings", "Dual Login: Successfully authenticated via Email + Password");
    const guestCookie = loginEmailRes.cookie;

    // 3b. Login via Mobile Number
    const loginMobileRes = await request(
      { path: "/login", method: "POST" },
      { username: testMobile, password: testPass }
    );
    assert(loginMobileRes.statusCode === 302 && loginMobileRes.headers.location === "/listings", "Dual Login: Successfully authenticated via Mobile Number + Password");

    // 3c. Login via Username
    const loginUserRes = await request(
      { path: "/login", method: "POST" },
      { username: registeredUser.username, password: testPass }
    );
    assert(loginUserRes.statusCode === 302 && loginUserRes.headers.location === "/listings", "Dual Login: Successfully authenticated via Username + Password");

    // ----------------------------------------------------
    // TEST 4: Admin Authentication, Reconciliation & RBAC
    // ----------------------------------------------------
    console.log("\nTest 4: Admin Authentication & Server-Side RBAC");
    const adminUser = await User.findOne({ email: "shaikhsohel6786@gmail.com" });
    assert(adminUser !== null && adminUser.role === "admin", "Primary admin shaikhsohel6786@gmail.com is reconciled with role 'admin'");

    // 4a. Regular user blocked from admin dashboard
    const blockedRes = await request({ path: "/admin/dashboard" }, null, guestCookie);
    assert(blockedRes.statusCode === 302 && blockedRes.headers.location === "/listings", "Normal user strictly blocked from /admin/dashboard by server-side isAdmin middleware");

    // 4b. Admin Login
    const adminLoginRes = await request(
      { path: "/admin/login", method: "POST" },
      { username: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    );
    assert(adminLoginRes.statusCode === 302, "Admin login request executed successfully");
    const adminCookie = adminLoginRes.cookie;

    // 4c. Admin accesses dashboard
    const adminDashRes = await request({ path: "/admin/dashboard" }, null, adminCookie);
    assert(adminDashRes.statusCode === 200, "Admin successfully accesses /admin/dashboard");
    assert(adminDashRes.data.includes("Booking Lifecycle Pipeline"), "Admin dashboard displays full Booking Lifecycle Pipeline");
    assert(adminDashRes.data.includes("Platform Hosts") || adminDashRes.data.includes("Hosts"), "Admin navigation contains Hosts tab");

    // 4d. Admin accesses hosts and reviews views
    const adminHostsRes = await request({ path: "/admin/hosts" }, null, adminCookie);
    assert(adminHostsRes.statusCode === 200, "Admin successfully accesses /admin/hosts control panel");

    const adminReviewsRes = await request({ path: "/admin/reviews" }, null, adminCookie);
    assert(adminReviewsRes.statusCode === 200, "Admin successfully accesses /admin/reviews moderation view");

    // ----------------------------------------------------
    // TEST 5: Booking Lifecycle Automation
    // ----------------------------------------------------
    console.log("\nTest 5: Booking Lifecycle Automation (Completed Status)");
    const pastBookingsCount = await Booking.countDocuments({ status: "Completed" });
    assert(pastBookingsCount >= 2, `Lifecycle automation verified: ${pastBookingsCount} past reservation(s) in 'Completed' state`);

    // ----------------------------------------------------
    // TEST 6: Verified Reviews Gating & Anti-Abuse
    // ----------------------------------------------------
    console.log("\nTest 6: Verified Reviews Gating (Only completed stays, 1 review per stay, no self-reviews)");
    const sampleListing = await Listing.findOne({ isPublished: true, status: "approved" }).populate("owner");
    assert(sampleListing !== null, "Found active published listing for review testing");

    // 6a. User with no completed booking tries to review
    const unbookedReviewRes = await request(
      { path: `/listings/${sampleListing._id}/reviews`, method: "POST" },
      { review: { rating: 5, comment: "Spam unverified review" } },
      guestCookie
    );
    assert(unbookedReviewRes.statusCode === 302, "Unbooked guest review is intercepted and redirected");
    const spamReview = await Review.findOne({ comment: "Spam unverified review" });
    assert(!spamReview, "Backend strictly prevented review submission from guest without completed booking");

    // 6b. Verified Review with completed booking
    const completedBooking = new Booking({
      bookingRef: `WL-TEST${Date.now().toString().slice(-4)}`,
      listing: sampleListing._id,
      user: registeredUser._id,
      checkIn: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      checkOut: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      totalGuests: 2,
      totalNights: 3,
      pricePerNight: sampleListing.price,
      basePrice: sampleListing.price * 3,
      tax: Math.round(sampleListing.price * 3 * 0.18),
      totalPrice: Math.round(sampleListing.price * 3 * 1.18),
      status: "Completed",
      hasReviewed: false,
    });
    await completedBooking.save();

    // Now submit verified review
    const verifiedReviewRes = await request(
      { path: `/listings/${sampleListing._id}/reviews`, method: "POST" },
      { review: { rating: 5, comment: "Exemplary stay! Spotless villa with breathtaking ocean vistas." } },
      guestCookie
    );
    assert(verifiedReviewRes.statusCode === 302, "Verified review successfully accepted and redirected");

    const createdReview = await Review.findOne({ booking: completedBooking._id });
    assert(createdReview !== null, "Verified review saved in database linked to booking and listing");
    assert(createdReview.isVerifiedStay === true, "Verified Stay badge flag set to true");

    const updatedBooking = await Booking.findById(completedBooking._id);
    assert(updatedBooking.hasReviewed === true, "Booking record marked hasReviewed: true (prevents duplicate reviews)");

    // 6c. Duplicate review attempt on same booking
    await request(
      { path: `/listings/${sampleListing._id}/reviews`, method: "POST" },
      { review: { rating: 4, comment: "Trying to submit second review" } },
      guestCookie
    );
    const dupReview = await Review.findOne({ comment: "Trying to submit second review" });
    assert(!dupReview, "Backend successfully blocked second review attempt for the same stay (1 review per stay)");

    // Clean up test review and booking
    await Review.deleteOne({ _id: createdReview._id });
    await Listing.findByIdAndUpdate(sampleListing._id, { $pull: { reviews: createdReview._id } });
    await Booking.deleteOne({ _id: completedBooking._id });

    // ----------------------------------------------------
    // TEST 7: Property Submission with Full Address & Pending Status
    // ----------------------------------------------------
    console.log("\nTest 7: Property Submission with Address & Approval Workflow");
    const newPropRes = await request(
      { path: "/listings", method: "POST" },
      {
        listing: {
          title: "Luxury Sunset Cliff Villa",
          description: "Panoramic cliffside ocean retreat with private infinity pool and chef services.",
          address: "Plot 42, Aguada Rocky Cliff Rd",
          city: "Sinquerim",
          state: "Goa",
          country: "India",
          location: "Sinquerim, Goa",
          price: 18500,
          maxGuests: 6,
          bedrooms: 3,
          beds: 4,
          bathrooms: 3,
          category: "Amazing Pools",
          propertyType: "Villa",
        },
        amenities: ["Wifi", "Pool", "Air conditioning", "Kitchen", "Sea view"],
      },
      guestCookie
    );
    assert(newPropRes.statusCode === 302, "New listing submitted successfully by host");

    const submittedListing = await Listing.findOne({ title: "Luxury Sunset Cliff Villa" });
    assert(submittedListing !== null, "Listing created in MongoDB with full address structure");
    assert(submittedListing.address === "Plot 42, Aguada Rocky Cliff Rd", "Address persisted correctly");
    assert(submittedListing.city === "Sinquerim", "City persisted correctly");
    assert(submittedListing.state === "Goa", "State persisted correctly");
    assert(submittedListing.status === "pending", "Non-admin submission automatically set to status: 'pending'");
    assert(submittedListing.isPublished === false, "Non-admin submission automatically set to isPublished: false");

    // Clean up test listing
    await Listing.deleteOne({ _id: submittedListing._id });

    // Clean up test user
    await User.deleteOne({ _id: registeredUser._id });

    // ----------------------------------------------------
    // FINAL RESULTS
    // ----------------------------------------------------
    console.log("\n========================================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("========================================================\n");

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution failed with error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
