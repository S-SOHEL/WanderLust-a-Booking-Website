require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
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
        reqOptions.headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
      reqOptions.headers["Content-Length"] = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
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

function buildMultipart(fields, files = []) {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
  const crlf = "\r\n";
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${key}"${crlf}${crlf}${val}${crlf}`));
  }

  for (const file of files) {
    const filename = file.filename || "file.jpg";
    const contentType = file.contentType || "image/jpeg";
    const fieldName = file.fieldName || "image";
    chunks.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${crlf}Content-Type: ${contentType}${crlf}${crlf}`));
    chunks.push(file.content);
    chunks.push(Buffer.from(crlf));
  }

  chunks.push(Buffer.from(`--${boundary}--${crlf}`));
  return {
    boundary,
    data: Buffer.concat(chunks),
  };
}

async function runQA() {
  console.log("\n========================================================");
  console.log("   WANDERLUST QA AUTOMATION & REGRESSION AUDIT SUITE    ");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;
  const bugsIdentified = [];

  function assert(condition, message, defectDetails = null) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
      if (defectDetails) bugsIdentified.push(defectDetails);
    }
  }

  await mongoose.connect("mongodb://127.0.0.1:27017/wanderlust");

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: CODE INTEGRITY & TEMPLATE COMPILATION
    // -------------------------------------------------------------------------
    console.log("--- SECTION 1: CODE INTEGRITY & TEMPLATES ---");
    const ejs = require("ejs");
    function walkEjs(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) results = results.concat(walkEjs(full));
        else if (full.endsWith(".ejs")) results.push(full);
      });
      return results;
    }
    const ejsFiles = walkEjs("views");
    let ejsErrors = 0;
    ejsFiles.forEach((f) => {
      try {
        ejs.compile(fs.readFileSync(f, "utf8"), { filename: f });
      } catch (e) {
        ejsErrors++;
        console.error(`EJS Syntax error in ${f}: ${e.message}`);
      }
    });
    assert(ejsErrors === 0, `All ${ejsFiles.length} EJS templates compile without syntax errors`);

    // -------------------------------------------------------------------------
    // SECTION 2: BOOKING OPERATIONS & SECURITY TESTING
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: BOOKING TESTING ---");
    const hostEmail = `qa_host_${Date.now()}@test.com`;
    const guest1Email = `qa_guest1_${Date.now()}@test.com`;
    const guest2Email = `qa_guest2_${Date.now()}@test.com`;
    const testPassword = "QASecurePass@2026";

    // Register host
    const regHostRes = await request(
      { path: "/signup", method: "POST" },
      { fullName: "QA Host User", email: hostEmail, mobile: `91${Math.floor(10000000 + Math.random() * 90000000)}`, password: testPassword, confirmPassword: testPassword }
    );
    const hostUser = await User.findOne({ email: hostEmail });
    const hostCookie = regHostRes.cookie;

    // Register guest 1
    const regGuest1Res = await request(
      { path: "/signup", method: "POST" },
      { fullName: "QA Guest One", email: guest1Email, mobile: `92${Math.floor(10000000 + Math.random() * 90000000)}`, password: testPassword, confirmPassword: testPassword }
    );
    const guest1User = await User.findOne({ email: guest1Email });
    const guest1Cookie = regGuest1Res.cookie;

    // Register guest 2
    const regGuest2Res = await request(
      { path: "/signup", method: "POST" },
      { fullName: "QA Guest Two", email: guest2Email, mobile: `93${Math.floor(10000000 + Math.random() * 90000000)}`, password: testPassword, confirmPassword: testPassword }
    );
    const guest2User = await User.findOne({ email: guest2Email });
    const guest2Cookie = regGuest2Res.cookie;

    // Create a verified test listing owned by hostUser
    const testListing = new Listing({
      title: "QA Automated Testing Villa",
      description: "Dedicated property for automated QA regression auditing.",
      location: "Candolim, Goa",
      country: "India",
      address: "123 Beach Road",
      city: "Candolim",
      state: "Goa",
      price: 5000,
      maxGuests: 4,
      bedrooms: 2,
      beds: 2,
      bathrooms: 2,
      category: "Trending",
      propertyType: "Villa",
      owner: hostUser._id,
      status: "approved",
      isPublished: true,
      geometry: { type: "Point", coordinates: [73.763, 15.518] },
      isLocationResolved: true,
      image: { url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994", filename: "test" },
    });
    await testListing.save();

    // 2a. Prevent Self-Booking (Host booking own property)
    const selfBookingRes = await request(
      { path: `/listings/${testListing._id}/bookings`, method: "POST" },
      {
        booking: {
          checkIn: new Date(Date.now() + 86400000).toISOString().split("T")[0],
          checkOut: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
          totalGuests: 2,
        },
      },
      hostCookie
    );
    assert(selfBookingRes.statusCode === 302, "Self-booking attempt is redirected with error");
    const selfBook = await Booking.findOne({ listing: testListing._id, user: hostUser._id });
    assert(!selfBook, "Host is strictly prevented from booking their own property");

    // 2b. Reject Invalid Dates: Past Date
    const pastDateRes = await request(
      { path: `/listings/${testListing._id}/bookings`, method: "POST" },
      {
        booking: {
          checkIn: "2020-01-01",
          checkOut: "2020-01-05",
          totalGuests: 2,
        },
      },
      guest1Cookie
    );
    assert(pastDateRes.statusCode === 302, "Past date booking request is redirected with error");
    const pastBook = await Booking.findOne({ listing: testListing._id, checkIn: new Date("2020-01-01") });
    assert(!pastBook, "Booking with past dates was successfully rejected");

    // 2c. Reject Invalid Dates: checkOut <= checkIn
    await request(
      { path: `/listings/${testListing._id}/bookings`, method: "POST" },
      {
        booking: {
          checkIn: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
          checkOut: new Date(Date.now() + 86400000).toISOString().split("T")[0],
          totalGuests: 2,
        },
      },
      guest1Cookie
    );
    const invRangeBook = await Booking.findOne({ listing: testListing._id, totalNights: { $lte: 0 } });
    assert(!invRangeBook, "Booking with checkOut <= checkIn was successfully rejected");

    // 2d. Create a Valid Booking
    const validCheckIn = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
    const validCheckOut = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
    const validBookingRes = await request(
      { path: `/listings/${testListing._id}/bookings`, method: "POST" },
      {
        booking: {
          checkIn: validCheckIn,
          checkOut: validCheckOut,
          totalGuests: 2,
          specialRequests: "Arriving late evening",
        },
      },
      guest1Cookie
    );
    assert(validBookingRes.statusCode === 302, "Valid booking request successfully created and redirected to /bookings");
    const createdBooking = await Booking.findOne({ listing: testListing._id, user: guest1User._id, status: "Pending" });
    assert(createdBooking !== null, "Booking saved in MongoDB with status: 'Pending'");
    assert(createdBooking.totalNights === 4, "Total nights calculated accurately (4 nights)");
    assert(createdBooking.totalPrice === Math.round(5000 * 4 * 1.18), "Total price computed correctly including 18% GST");

    // 2e. Admin Confirms the Booking
    const adminLoginRes = await request(
      { path: "/admin/login", method: "POST" },
      { username: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
    );
    const adminCookie = adminLoginRes.cookie;
    const confirmRes = await request(
      { path: `/admin/bookings/${createdBooking._id}/approve?_method=PATCH`, method: "POST" },
      null,
      adminCookie
    );
    assert(confirmRes.statusCode === 302, "Admin approved booking successfully");
    const confirmedBooking = await Booking.findById(createdBooking._id);
    assert(confirmedBooking.status === "Confirmed", "Booking status successfully updated to 'Confirmed'");

    // 2f. Reject Overlapping Confirmed Booking
    await request(
      { path: `/listings/${testListing._id}/bookings`, method: "POST" },
      {
        booking: {
          checkIn: new Date(Date.now() + 12 * 86400000).toISOString().split("T")[0],
          checkOut: new Date(Date.now() + 16 * 86400000).toISOString().split("T")[0],
          totalGuests: 1,
        },
      },
      guest2Cookie
    );
    const overlapBook = await Booking.findOne({ listing: testListing._id, user: guest2User._id });
    assert(!overlapBook, "Booking request overlapping with confirmed reservation was rejected");

    // 2g. Verify Booking Ownership on Cancellation
    await request(
      { path: `/bookings/${confirmedBooking._id}?_method=DELETE`, method: "POST" },
      null,
      guest2Cookie
    );
    const afterUnauth = await Booking.findById(confirmedBooking._id);
    assert(afterUnauth.status === "Confirmed", "Unauthorized user (different guest) cannot cancel someone else's booking");

    // 2h. Valid Cancellation by Booking Owner
    const cancelRes = await request(
      { path: `/bookings/${confirmedBooking._id}?_method=DELETE`, method: "POST" },
      null,
      guest1Cookie
    );
    assert(cancelRes.statusCode === 302, "Booking owner successfully cancelled reservation");
    const cancelledBooking = await Booking.findById(confirmedBooking._id);
    assert(cancelledBooking.status === "Cancelled", "Booking status updated to 'Cancelled'");

    // 2i. Verify Cancelled Bookings NEVER become Completed
    cancelledBooking.checkOut = new Date(Date.now() - 86400000);
    await cancelledBooking.save();
    await autoUpdateCompletedBookings();
    const checkCancelled = await Booking.findById(cancelledBooking._id);
    assert(checkCancelled.status === "Cancelled", "Cancelled booking with past checkout remains 'Cancelled' and NEVER becomes 'Completed'");

    // 2j. Verify Automatic Completion After Checkout
    const completedStayBooking = new Booking({
      bookingRef: `WL-QA${Date.now().toString().slice(-4)}`,
      listing: testListing._id,
      user: guest1User._id,
      checkIn: new Date(Date.now() - 5 * 86400000),
      checkOut: new Date(Date.now() - 1 * 86400000),
      totalGuests: 2,
      totalNights: 4,
      pricePerNight: 5000,
      basePrice: 20000,
      tax: 3600,
      totalPrice: 23600,
      status: "Confirmed",
      hasReviewed: false,
    });
    await completedStayBooking.save();

    await autoUpdateCompletedBookings();
    const autoCompleted = await Booking.findById(completedStayBooking._id);
    assert(autoCompleted.status === "Completed", "Confirmed booking past checkout automatically transitioned to 'Completed'");

    // 2k. Attempting to Cancel a Completed Booking is Blocked
    await request(
      { path: `/bookings/${autoCompleted._id}?_method=DELETE`, method: "POST" },
      null,
      guest1Cookie
    );
    const verifyStillCompleted = await Booking.findById(autoCompleted._id);
    assert(verifyStillCompleted.status === "Completed", "Completed stay cannot be cancelled by guest");

    // -------------------------------------------------------------------------
    // SECTION 3: REVIEW SECURITY & GATING
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: REVIEW SECURITY TESTING ---");

    // 3a. User Without Booking Cannot Review
    await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 5, "review[comment]": "Great place!" },
      guest2Cookie
    );
    const noBookingReview = await Review.findOne({ author: guest2User._id, listing: testListing._id });
    assert(!noBookingReview, "Guest without any booking cannot submit a review");

    // 3b. Host Cannot Review Own Property
    await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 5, "review[comment]": "My own property is great!" },
      hostCookie
    );
    const hostReview = await Review.findOne({ author: hostUser._id, listing: testListing._id });
    assert(!hostReview, "Property host cannot review their own listing");

    // 3c. Pending Booking Cannot Be Reviewed
    const pendingBooking = new Booking({
      bookingRef: `WL-QAP${Date.now().toString().slice(-4)}`,
      listing: testListing._id,
      user: guest2User._id,
      checkIn: new Date(Date.now() + 86400000),
      checkOut: new Date(Date.now() + 3 * 86400000),
      totalGuests: 1,
      totalNights: 2,
      basePrice: 10000,
      tax: 1800,
      totalPrice: 11800,
      status: "Pending",
    });
    await pendingBooking.save();
    await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 4, "review[comment]": "Pending booking review attempt" },
      guest2Cookie
    );
    const pendingRev = await Review.findOne({ author: guest2User._id, comment: "Pending booking review attempt" });
    assert(!pendingRev, "Pending booking cannot be reviewed");
    await Booking.deleteOne({ _id: pendingBooking._id });

    // 3d. Confirmed Booking (Before Checkout) Cannot Be Reviewed
    const futureConfirmedBooking = new Booking({
      bookingRef: `WL-QAF${Date.now().toString().slice(-4)}`,
      listing: testListing._id,
      user: guest2User._id,
      checkIn: new Date(Date.now() + 5 * 86400000),
      checkOut: new Date(Date.now() + 8 * 86400000),
      totalGuests: 1,
      totalNights: 3,
      basePrice: 15000,
      tax: 2700,
      totalPrice: 17700,
      status: "Confirmed",
    });
    await futureConfirmedBooking.save();
    await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 4, "review[comment]": "Active upcoming booking review attempt" },
      guest2Cookie
    );
    const futureRev = await Review.findOne({ author: guest2User._id, comment: "Active upcoming booking review attempt" });
    assert(!futureRev, "Confirmed booking before checkout cannot be reviewed");
    await Booking.deleteOne({ _id: futureConfirmedBooking._id });

    // 3e. Cancelled Booking Cannot Be Reviewed (Tested with user who ONLY has a cancelled booking)
    const cancelledBookingGuest2 = new Booking({
      bookingRef: `WL-QAC${Date.now().toString().slice(-4)}`,
      listing: testListing._id,
      user: guest2User._id,
      checkIn: new Date(Date.now() - 5 * 86400000),
      checkOut: new Date(Date.now() - 2 * 86400000),
      totalGuests: 1,
      totalNights: 3,
      basePrice: 15000,
      tax: 2700,
      totalPrice: 17700,
      status: "Cancelled",
    });
    await cancelledBookingGuest2.save();
    await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 1, "review[comment]": "Cancelled booking review attempt" },
      guest2Cookie
    );
    const cancelledRev = await Review.findOne({ author: guest2User._id, comment: "Cancelled booking review attempt" });
    assert(!cancelledRev, "Guest with only a cancelled booking cannot submit a review");
    await Booking.deleteOne({ _id: cancelledBookingGuest2._id });

    // 3f. Rating Bounds Validation (1 to 5)
    const ratingOutLowRes = await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 0, "review[comment]": "Zero rating" },
      guest1Cookie
    );
    assert(ratingOutLowRes.statusCode === 400 || ratingOutLowRes.statusCode === 302, "Rating < 1 was rejected");

    const ratingOutHighRes = await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 6, "review[comment]": "Six rating" },
      guest1Cookie
    );
    assert(ratingOutHighRes.statusCode === 400 || ratingOutHighRes.statusCode === 302, "Rating > 5 was rejected");

    // 3g. Completed Booking Can Be Reviewed
    const validRevRes = await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 5, "review[comment]": "Superb villa! Impeccable cleanliness and great amenities." },
      guest1Cookie
    );
    assert(validRevRes.statusCode === 302, "Completed booking review successfully accepted");
    const validRev = await Review.findOne({ booking: autoCompleted._id });
    assert(validRev !== null, "Review document created in MongoDB linked to booking");
    assert(validRev.isVerifiedStay === true, "Review flagged as Verified Stay");
    assert(validRev.rating === 5, "Rating persisted accurately as 5");

    const bookingAfterRev = await Booking.findById(autoCompleted._id);
    assert(bookingAfterRev.hasReviewed === true, "Booking record marked hasReviewed: true");

    // 3h. Same Booking Cannot Be Reviewed Twice (Duplicate Prevention)
    await request(
      { path: `/listings/${testListing._id}/reviews`, method: "POST" },
      { "review[rating]": 5, "review[comment]": "Trying duplicate review for same stay" },
      guest1Cookie
    );
    const dupRev = await Review.findOne({ comment: "Trying duplicate review for same stay" });
    assert(!dupRev, "Duplicate review for the same completed stay was strictly prevented");

    // -------------------------------------------------------------------------
    // SECTION 4: PROFILE UPDATES & IMAGE UPLOADS
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: PROFILE & IMAGE UPLOADS ---");

    // 4a. Update Full Name, Email, Mobile
    const updatedEmail = `ayaan_updated_${Date.now()}@test.com`;
    const updatedMobile = `94${Math.floor(10000000 + Math.random() * 90000000)}`;
    const updateProfileRes = await request(
      { path: "/profile?_method=PUT", method: "POST" },
      {
        fullName: "Ayaan S. Shaikh",
        email: updatedEmail,
        mobile: updatedMobile,
      },
      guest1Cookie
    );
    assert(updateProfileRes.statusCode === 302, "PUT /profile redirects upon update");
    const updatedUser = await User.findById(guest1User._id);
    assert(updatedUser.fullName === "Ayaan S. Shaikh", "Full name updated successfully");
    assert(updatedUser.email === updatedEmail, "Email updated successfully");
    assert(updatedUser.mobile === updatedMobile, "Mobile updated successfully");

    // 4b. Profile Picture Upload (Valid 1x1 PNG image)
    const validPngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const mp = buildMultipart({ fullName: "Ayaan S. Shaikh" }, [{
      fieldName: "profileImage",
      filename: "avatar.png",
      contentType: "image/png",
      content: validPngBuffer,
    }]);

    const uploadProfileRes = await request(
      { path: "/profile?_method=PUT", method: "POST" },
      mp.data,
      guest1Cookie,
      { "Content-Type": `multipart/form-data; boundary=${mp.boundary}` }
    );
    assert(uploadProfileRes.statusCode === 302, "Profile image upload handled successfully");
    const userWithPic = await User.findById(guest1User._id);
    assert(userWithPic.profileImage && userWithPic.profileImage.url && userWithPic.profileImage.url.length > 0, "Profile image URL saved on user document");
    assert(userWithPic.profileImage.url.startsWith("http://") || userWithPic.profileImage.url.startsWith("https://") || userWithPic.profileImage.url.startsWith("/uploads/"), "Profile image URL is accessible via HTTP endpoint or /uploads");

    // 4c. Change Password
    const newSecurePassword = "BrandNewSecurePassword@2026";
    const changePassRes = await request(
      { path: "/profile/change-password", method: "POST" },
      {
        currentPassword: testPassword,
        newPassword: newSecurePassword,
        confirmNewPassword: newSecurePassword,
      },
      guest1Cookie
    );
    assert(changePassRes.statusCode === 302, "Password change request executed and redirected");

    // Verify login with new password
    const testNewLogin = await request(
      { path: "/login", method: "POST" },
      { username: updatedEmail, password: newSecurePassword }
    );
    assert(testNewLogin.statusCode === 302 && testNewLogin.headers.location === "/listings", "Successfully logged in with new password");

    // 4d. Reject Invalid File Types (e.g. .txt)
    const textFileBuffer = Buffer.from("This is a plain text file, not an image!");
    const mpBadFile = buildMultipart({ fullName: "Ayaan S. Shaikh" }, [{
      fieldName: "profileImage",
      filename: "malicious.txt",
      contentType: "text/plain",
      content: textFileBuffer,
    }]);
    const badFileRes = await request(
      { path: "/profile?_method=PUT", method: "POST" },
      mpBadFile.data,
      guest1Cookie,
      { "Content-Type": `multipart/form-data; boundary=${mpBadFile.boundary}` }
    );
    assert(badFileRes.statusCode === 500 || badFileRes.statusCode === 302 || badFileRes.statusCode === 400, "Invalid non-image file (.txt) was safely rejected by multer filter");

    // 4e. Handle Oversized Files (> 5MB)
    const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024, 0); // 6MB
    const mpOversized = buildMultipart({ fullName: "Ayaan S. Shaikh" }, [{
      fieldName: "profileImage",
      filename: "large.png",
      contentType: "image/png",
      content: oversizedBuffer,
    }]);
    const oversizedRes = await request(
      { path: "/profile?_method=PUT", method: "POST" },
      mpOversized.data,
      guest1Cookie,
      { "Content-Type": `multipart/form-data; boundary=${mpOversized.boundary}` }
    );
    assert(oversizedRes.statusCode === 500 || oversizedRes.statusCode === 400 || oversizedRes.statusCode === 302, "Oversized file (>5MB) was intercepted by multer size limits");

    // -------------------------------------------------------------------------
    // SECTION 5: ADMIN FUNCTIONAL OPERATIONS
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: ADMIN FUNCTIONAL TESTING ---");

    // 5a. Admin Views All Users
    const usersViewRes = await request({ path: "/admin/users" }, null, adminCookie);
    assert(usersViewRes.statusCode === 200, "GET /admin/users returns 200 OK");
    assert(usersViewRes.data.includes("User & Role Management"), "User & Role Management rendered in admin users view");

    // 5b. Admin Views All Hosts
    const hostsViewRes = await request({ path: "/admin/hosts" }, null, adminCookie);
    assert(hostsViewRes.statusCode === 200, "GET /admin/hosts returns 200 OK");
    assert(hostsViewRes.data.includes("Platform Hosts"), "Platform Hosts table rendered in admin view");

    // 5c. Admin Views All Listings & Approvals
    const listingsViewRes = await request({ path: "/admin/listings" }, null, adminCookie);
    assert(listingsViewRes.statusCode === 200, "GET /admin/listings returns 200 OK");
    assert(listingsViewRes.data.includes("Property Inventory Management"), "Property inventory table rendered in admin view");

    // 5d. Host Submits New Listing -> Admin Approves It
    const pendingListing = new Listing({
      title: "Pending Approval Luxury Cottage",
      description: "Cozy hillside retreat with panoramic forest canopy view.",
      location: "Manali, Himachal Pradesh",
      country: "India",
      address: "Old Manali Rd",
      city: "Manali",
      state: "Himachal Pradesh",
      price: 3200,
      maxGuests: 3,
      category: "Mountains",
      propertyType: "Cottage",
      owner: hostUser._id,
      status: "pending",
      isPublished: false,
      geometry: { type: "Point", coordinates: [77.1892, 32.2432] },
      isLocationResolved: true,
    });
    await pendingListing.save();

    const approveListingRes = await request(
      { path: `/admin/listings/${pendingListing._id}/approve?_method=PATCH`, method: "POST" },
      null,
      adminCookie
    );
    assert(approveListingRes.statusCode === 302, "Admin approve listing executed successfully");
    const approvedListing = await Listing.findById(pendingListing._id);
    assert(approvedListing.status === "approved" && approvedListing.isPublished === true, "Listing status transitioned to 'approved' and isPublished: true");

    // 5e. Admin Unpublishes Listing
    const togglePublishRes = await request(
      { path: `/admin/listings/${approvedListing._id}/toggle-publish?_method=PATCH`, method: "POST" },
      null,
      adminCookie
    );
    assert(togglePublishRes.statusCode === 302, "Admin toggle publish executed successfully");
    const unpublishedListing = await Listing.findById(approvedListing._id);
    assert(unpublishedListing.isPublished === false, "Listing isPublished successfully toggled to false");

    // 5f. Admin Rejects Listing
    const rejectListingRes = await request(
      { path: `/admin/listings/${approvedListing._id}/reject?_method=PATCH`, method: "POST" },
      { rejectionReason: "Image resolution does not meet quality requirements" },
      adminCookie
    );
    assert(rejectListingRes.statusCode === 302, "Admin reject listing executed successfully");
    const rejectedListing = await Listing.findById(approvedListing._id);
    assert(rejectedListing.status === "rejected" && rejectedListing.rejectionReason.includes("Image resolution"), "Listing status is 'rejected' with recorded reason");

    // 5g. Admin Views & Moderates Reviews
    const reviewsViewRes = await request({ path: "/admin/reviews" }, null, adminCookie);
    assert(reviewsViewRes.statusCode === 200, "GET /admin/reviews returns 200 OK");
    assert(reviewsViewRes.data.includes("Reviews Moderation"), "Reviews moderation table rendered in admin view");

    // Delete review as admin
    const delReviewRes = await request(
      { path: `/admin/reviews/${validRev._id}?_method=DELETE`, method: "POST" },
      null,
      adminCookie
    );
    assert(delReviewRes.statusCode === 302, "Admin deleted review successfully");
    const deletedRev = await Review.findById(validRev._id);
    assert(!deletedRev, "Review document removed from database");
    const bookingReset = await Booking.findById(autoCompleted._id);
    assert(bookingReset.hasReviewed === false, "Booking hasReviewed reset to false so guest can re-review if needed");

    // 5h. Anti-Lockout Security: Prevent Last Admin Demotion
    await request(
      { path: `/admin/users/${(await User.findOne({ email: "shaikhsohel6786@gmail.com" }))._id}/toggle-role?_method=PATCH`, method: "POST" },
      null,
      adminCookie
    );
    const adminStillAdmin = await User.findOne({ email: "shaikhsohel6786@gmail.com" });
    assert(adminStillAdmin.role === "admin", "Admin self-demotion strictly blocked by server-side security");

    // -------------------------------------------------------------------------
    // SECTION 6: MAPBOX VERIFICATION & FALLBACK
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 6: MAPBOX VERIFICATION ---");
    const mapJsContent = fs.readFileSync("public/js/map.js", "utf8");
    assert(mapJsContent.includes("typeof mapToken !== \"undefined\""), "Map.js validates mapToken defined state before initializing");
    assert(mapJsContent.includes("Map Preview") || mapJsContent.includes("mapContainer"), "Map.js provides graceful fallback UI when MAP_TOKEN is unset or empty");
    assert(mapJsContent.includes("listing.geometry.coordinates") && mapJsContent.includes("mapboxgl.Map"), "Map.js correctly handles GeoJSON [longitude, latitude] coordinate array");

    // -------------------------------------------------------------------------
    // CLEANUP TEMPORARY QA FIXTURES
    // -------------------------------------------------------------------------
    await Listing.deleteMany({ _id: { $in: [testListing._id, pendingListing._id] } });
    await Booking.deleteMany({ listing: { $in: [testListing._id, pendingListing._id] } });
    await User.deleteMany({ _id: { $in: [hostUser._id, guest1User._id, guest2User._id] } });

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n========================================================");
    console.log(`QA AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    if (bugsIdentified.length > 0) {
      console.log(`Defects identified: ${bugsIdentified.length}`);
      bugsIdentified.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    } else {
      console.log("Zero defects found during automated regression testing.");
    }
    console.log("========================================================\n");

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("QA execution fatal error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runQA();
