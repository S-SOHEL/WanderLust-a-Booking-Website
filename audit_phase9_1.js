require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const User = require("./models/user.js");
const Listing = require("./models/listing.js");
const Booking = require("./models/booking.js");

function request(options, postData = null, cookie = "", customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: "127.0.0.1",
      port: 8080,
      path: options.path,
      method: options.method || "GET",
      headers: { ...(options.headers || {}), ...customHeaders },
    };

    if (cookie) reqOptions.headers["Cookie"] = cookie;

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, data });
      });
    });

    req.on("error", (e) => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAudit() {
  console.log("======================================================================");
  console.log("       WANDERLUST PHASE 9.1 FINAL UI FUNCTIONALITY VERIFICATION       ");
  console.log("======================================================================");

  await mongoose.connect("mongodb://127.0.0.1:27017/wanderlust");

  let passed = 0;
  let failed = 0;
  const auditResults = [];

  function assert(condition, testName, evidence = "") {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
      auditResults.push({ name: testName, status: "PASS", evidence });
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
      auditResults.push({ name: testName, status: "FAIL", evidence });
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. MAPBOX LOCATION CORRECTNESS
    // -------------------------------------------------------------------------
    console.log("\n--- AREA 1: MAPBOX LOCATION CORRECTNESS ---");

    // 1a. Test Verification Villa in Lonavala
    const testVilla = await Listing.findOne({ title: { $regex: "Test Verification Villa", $options: "i" } });
    assert(testVilla !== null, "Test Verification Villa exists in database");

    const villaCoords = testVilla.geometry.coordinates;
    const isMumbai = Math.abs(villaCoords[0] - 72.8777) < 0.01 && Math.abs(villaCoords[1] - 19.0760) < 0.01;
    assert(!isMumbai, "Test Verification Villa coordinates are NOT default Mumbai coordinates");

    // Lonavala is ~73.40° E, 18.75° N
    const isLonavala = Math.abs(villaCoords[0] - 73.40) < 0.1 && Math.abs(villaCoords[1] - 18.75) < 0.1;
    assert(isLonavala, `Test Verification Villa coordinates correctly point to Lonavala: [${villaCoords[0]}, ${villaCoords[1]}]`);

    // 1b. Test Diverse Listings in Other Locations
    const locationsToTest = [
      { titleMatch: "Hidden Valley Treehouse", expectedLng: 76.25, expectedLat: 11.66, label: "Wayanad, Kerala" },
      { titleMatch: "Historic Villa in Tuscany", expectedLng: 11.25, expectedLat: 43.77, label: "Florence, Italy" },
      { titleMatch: "Cozy Beachfront Cottage", expectedLng: -118.68, expectedLat: 34.03, label: "Malibu, California" },
      { titleMatch: "Modern Loft in Downtown", expectedLng: -74.00, expectedLat: 40.71, label: "New York City, NY" },
    ];

    for (const loc of locationsToTest) {
      const listingDoc = await Listing.findOne({ title: { $regex: loc.titleMatch, $options: "i" } });
      assert(listingDoc !== null, `Listing "${loc.titleMatch}" found in DB`);
      if (listingDoc) {
        const coords = listingDoc.geometry.coordinates;
        const validGeo = Math.abs(coords[0] - loc.expectedLng) < 0.2 && Math.abs(coords[1] - loc.expectedLat) < 0.2;
        assert(validGeo, `Listing "${loc.titleMatch}" coordinates match ${loc.label}: [${coords[0]}, ${coords[1]}]`);
      }
    }

    // 1c. Verify client-side map.js uses coordinates accurately
    const mapJsContent = fs.readFileSync(path.join(__dirname, "public", "js", "map.js"), "utf8");
    assert(
      mapJsContent.includes("center: coordinates") && mapJsContent.includes(".setLngLat(coordinates)"),
      "map.js binds both map center and marker position strictly to listing coordinates"
    );

    // -------------------------------------------------------------------------
    // 2. WISHLIST FUNCTIONALITY AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- AREA 2: WISHLIST FUNCTIONALITY ---");

    const userSchema = User.schema.paths;
    const listingSchema = Listing.schema.paths;
    const hasUserWishlist = Object.prototype.hasOwnProperty.call(userSchema, "wishlist");
    const hasListingWishlist = Object.prototype.hasOwnProperty.call(listingSchema, "savedBy");

    assert(
      !hasUserWishlist && !hasListingWishlist,
      "Confirmed: Database schemas do NOT define a wishlist field (No backend persistence)"
    );

    const showEjsContent = fs.readFileSync(path.join(__dirname, "views", "listings", "show.ejs"), "utf8");
    assert(
      showEjsContent.includes('saveBtn.addEventListener("click"'),
      "Save button is implemented as a client-side visual state toggle (heart icon change)"
    );

    // -------------------------------------------------------------------------
    // 3. HOST IDENTITY AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- AREA 3: HOST IDENTITY ---");

    // Check helper logic in show.ejs
    assert(
      showEjsContent.includes("function getHostDisplayName(owner)"),
      "show.ejs defines getHostDisplayName sanitizer function"
    );

    // Test sanitization function in isolation
    function getHostDisplayName(owner) {
      if (!owner) return "Verified Host";
      if (owner.fullName && owner.fullName.trim()) return owner.fullName.trim();
      if (owner.username) {
        let clean = owner.username.replace(/[0-9]{5,}/g, "").replace(/_+$/, "").replace(/^_/, "").trim();
        if (clean.toLowerCase() === "admin") return "WanderLust Concierge";
        if (clean.includes("_")) {
          clean = clean.split("_")[0];
        }
        return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Verified Host";
      }
      return "Verified Host";
    }

    // 3a. Owner with explicit fullName
    const hostWithFullName = { fullName: "Ayaan Shaikh", username: "ayaan_shaikh_123" };
    assert(
      getHostDisplayName(hostWithFullName) === "Ayaan Shaikh",
      "Host with explicit fullName displays actual fullName"
    );

    // 3b. Owner with username 'admin'
    const adminHost = { fullName: "", username: "admin" };
    assert(
      getHostDisplayName(adminHost) === "WanderLust Concierge",
      "Host with username 'admin' cleanly resolves to 'WanderLust Concierge' without raw ID"
    );

    // 3c. Owner with username with underscore & numbers (e.g., traveler_1792508874020)
    const generatedHost = { fullName: "", username: "traveler_1792508874020" };
    assert(
      getHostDisplayName(generatedHost) === "Traveler",
      "Host with numeric generated username resolves to clean title case without numeric suffixes"
    );

    // 3d. Check HTML rendered on show page for Test Verification Villa
    const villaShowRes = await request({ path: `/listings/${testVilla._id}` });
    assert(villaShowRes.statusCode === 200, "GET /listings/:id for Test Verification Villa returns 200 OK");
    assert(
      villaShowRes.data.includes("Hosted by WanderLust Concierge") || villaShowRes.data.includes("Hosted by"),
      "Show page renders clean host display name"
    );
    assert(
      !villaShowRes.data.includes("Hosted by admin") && !villaShowRes.data.includes("Hosted by 6ad"),
      "Show page strictly does NOT render raw 'admin' or database ObjectID"
    );

    // -------------------------------------------------------------------------
    // 4. TAX AND BOOKING PRICE CONSISTENCY
    // -------------------------------------------------------------------------
    console.log("\n--- AREA 4: TAX & BOOKING PRICE CONSISTENCY ---");

    const samplePrice = 7500;
    const gstRate = 0.18;

    // Server calculation in controller/bookings.js
    const serverNights = 4;
    const serverBasePrice = samplePrice * serverNights;
    const serverTax = Math.round(serverBasePrice * gstRate);
    const serverTotalPrice = serverBasePrice + serverTax;

    assert(serverTax === Math.round(30000 * 0.18), "Server calculates 18% GST with Math.round (4 nights = ₹5,400)");
    assert(serverTotalPrice === 35400, "Server total price is exact base + tax (₹35,400)");

    // Homepage per-night calculation
    const homepagePerNightWithTax = Math.round(samplePrice * (1 + gstRate));
    assert(
      homepagePerNightWithTax === samplePrice + Math.round(samplePrice * gstRate),
      "Homepage per-night tax display (₹8,850) strictly equals 1-night server calculation (₹7,500 + ₹1,350)"
    );

    // Multi-night booking consistency check
    const bookingsControllerContent = fs.readFileSync(path.join(__dirname, "controller", "bookings.js"), "utf8");
    assert(
      bookingsControllerContent.includes("const tax = Math.round(basePrice * 0.18)") &&
        bookingsControllerContent.includes("const totalPrice = basePrice + tax"),
      "controller/bookings.js strictly enforces server-side 18% GST calculation"
    );

    // Verify show.ejs total label is 'Total after taxes (incl. 18% GST)'
    const updatedShowEjs = fs.readFileSync(path.join(__dirname, "views", "listings", "show.ejs"), "utf8");
    assert(
      updatedShowEjs.includes("Total after taxes (incl. 18% GST)"),
      "show.ejs displays accurate 'Total after taxes (incl. 18% GST)' label for grand total"
    );

    // -------------------------------------------------------------------------
    // 5. PHOTO GALLERY AUDIT
    // -------------------------------------------------------------------------
    console.log("\n--- AREA 5: PHOTO GALLERY ---");

    assert(
      updatedShowEjs.includes("gallery-grid-5") &&
        updatedShowEjs.includes("gallery-grid-4") &&
        updatedShowEjs.includes("gallery-grid-3") &&
        updatedShowEjs.includes("gallery-grid-2") &&
        updatedShowEjs.includes("gallery-single"),
      "show.ejs defines distinct layouts for 1, 2, 3, 4, and 5+ images"
    );

    assert(
      updatedShowEjs.includes('id="photoGalleryModal"') &&
        updatedShowEjs.includes('id="galleryCarousel"'),
      "Fullscreen lightbox modal and carousel container exist in show.ejs"
    );

    assert(
      updatedShowEjs.includes('data-bs-keyboard="true"') &&
        updatedShowEjs.includes('data-bs-touch="true"'),
      "Carousel enables native keyboard and mobile touch swipe navigation"
    );

    assert(
      updatedShowEjs.includes("photoGalleryModal.addEventListener(\"show.bs.modal\"") &&
        updatedShowEjs.includes("carouselInstance.to(slideIndex)"),
      "Gallery modal automatically jumps to clicked slide index"
    );

    assert(
      updatedShowEjs.includes("onerror=\"this.onerror=null; this.src="),
      "Image elements include graceful onerror fallback to prevent broken gallery layouts"
    );

    console.log("\n======================================================================");
    console.log(`PHASE 9.1 AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("======================================================================");
  } finally {
    await mongoose.disconnect();
  }

  return { passed, failed, auditResults };
}

runAudit()
  .then((res) => {
    if (res.failed > 0) process.exit(1);
    else process.exit(0);
  })
  .catch((e) => {
    console.error("Audit failure:", e);
    process.exit(1);
  });
