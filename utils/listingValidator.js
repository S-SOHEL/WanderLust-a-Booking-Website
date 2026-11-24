/**
 * WanderLust Listing Validator Utility
 * Path: utils/listingValidator.js
 * 
 * Reusable, schema-compliant validation engine for bulk listing import.
 * Strictly adheres to models/listing.js and business logic rules.
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");
const { verifyEvidenceReference } = require("./evidenceLedger.js");

// Six Independent Verification Dimensions (Phase 10.6)
const PROPERTY_EXISTENCE_STATUSES = [
  "UNVERIFIED",
  "PENDING_INSPECTION",
  "PHYSICAL_SITE_VERIFIED",
  "MUNICIPAL_REGISTRY_CONFIRMED",
];

const HOST_AUTHORITY_STATUSES = [
  "UNVERIFIED",
  "PENDING_DOCUMENTATION",
  "OWNER_DIRECT_CONFIRMED",
  "AUTHORIZED_MANAGER_CONFIRMED",
];

const RATE_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "ESTIMATED_BENCHMARK",
  "OWNER_RATE_CARD_CONFIRMED",
  "SEASONAL_PUBLISHED_CONFIRMED",
];

const COORDINATE_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "REGIONAL_CENTROID_WARNING",
  "ROOFTOP_GEO_CONFIRMED",
  "ON_SITE_GPS_CONFIRMED",
];

const IMAGE_PERMISSION_STATUSES = [
  "UNVERIFIED",
  "PENDING_CLEARANCE",
  "ILLUSTRATIVE_SAMPLE_UNSPLASH",
  "OWNER_DIRECT_PERMISSION",
  "LICENSED_STOCK_VERIFIED",
];

const EDITORIAL_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "EDITORIAL_APPROVED",
  "REJECTED_COPYRIGHT_RISK",
];

const ALLOWED_COORDINATE_SOURCES = [
  "GEOJSON_INPUT",
  "MAPBOX_GEOCODE",
  "ADMIN_MANUAL_PIN",
  "INDICATIVE_LOCALITY_PIN",
  "ROOFTOP_ON_SITE_GPS",
  "MUNICIPAL_TAX_RECORD",
  "UNRESOLVED",
];

// Documented Destination Centroids for the 15 Configured Destinations
// Order: [longitude, latitude]
// NOTE: These coordinates represent approximate regional reference landmarks (municipal
// centers, town squares, and civic stations) used exclusively for proximity-based centroid collision
// detection and publication gating. They are NOT authoritative property locations and must never
// be used as default or surrogate coordinates for genuine property listings.
const DESTINATION_CENTROIDS = {
  goa: { name: "Goa (Panaji Municipal Center)", coordinates: [73.8278, 15.4909] },
  mumbai: { name: "Mumbai (Churchgate/CST Center)", coordinates: [72.8347, 18.9400] },
  pune: { name: "Pune (Shaniwar Wada / Central)", coordinates: [73.8553, 18.5196] },
  lonavala: { name: "Lonavala (Municipal Station Center)", coordinates: [73.4072, 18.7546] },
  jaipur: { name: "Jaipur (Badi Chaupar / Pink City)", coordinates: [75.8267, 26.9239] },
  udaipur: { name: "Udaipur (City Palace / Pichola)", coordinates: [73.6835, 24.5764] },
  "delhi ncr": { name: "Delhi NCR (Connaught Place Center)", coordinates: [77.2167, 28.6328] },
  delhi: { name: "Delhi NCR (Connaught Place Center)", coordinates: [77.2167, 28.6328] },
  manali: { name: "Manali (Mall Road Center)", coordinates: [77.1887, 32.2396] },
  shimla: { name: "Shimla (The Ridge / Mall Road)", coordinates: [77.1734, 31.1048] },
  rishikesh: { name: "Rishikesh (Triveni Ghat Center)", coordinates: [78.2946, 30.1065] },
  mussoorie: { name: "Mussoorie (Library Chowk / The Mall)", coordinates: [78.0664, 30.4598] },
  munnar: { name: "Munnar (Old Munnar Center)", coordinates: [77.0595, 10.0889] },
  alleppey: { name: "Alleppey (Alappuzha Town Center)", coordinates: [76.3388, 9.4981] },
  coorg: { name: "Coorg (Madikeri Fort Center)", coordinates: [75.7382, 12.4244] },
  ooty: { name: "Ooty (Charring Cross Center)", coordinates: [76.7032, 11.4102] },
};

/**
 * Calculates Haversine distance between two [lng, lat] coordinate points in meters
 */
function calculateHaversineDistanceMeters(coord1, coord2) {
  if (!Array.isArray(coord1) || !Array.isArray(coord2) || coord1.length < 2 || coord2.length < 2) {
    return Infinity;
  }
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Checks if coordinates are within 200m of a destination municipal centroid
 */
function checkCentroidProximity(coords, city = "") {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return { isNearCentroid: false, distanceMeters: Infinity, matchedDestination: null };
  }

  const normCity = (city || "").toLowerCase().trim();
  const destinationsToCheck = [];

  if (normCity && DESTINATION_CENTROIDS[normCity]) {
    destinationsToCheck.push(DESTINATION_CENTROIDS[normCity]);
  } else {
    // Check against all destinations if city not specifically mapped
    for (const key of Object.keys(DESTINATION_CENTROIDS)) {
      destinationsToCheck.push(DESTINATION_CENTROIDS[key]);
    }
  }

  for (const dest of destinationsToCheck) {
    const dist = calculateHaversineDistanceMeters(coords, dest.coordinates);
    if (dist <= 200) {
      return {
        isNearCentroid: true,
        distanceMeters: dist,
        matchedDestination: dest.name,
      };
    }
  }

  return { isNearCentroid: false, distanceMeters: Infinity, matchedDestination: null };
}

/**
 * Safely parses and validates remediationNotes JSON
 */
function parseRemediationNotes(rawNotes) {
  if (!rawNotes || typeof rawNotes !== "string") {
    return { isValidJson: true, data: {}, raw: "" };
  }
  const trimmed = rawNotes.trim();
  if (!trimmed) {
    return { isValidJson: true, data: {}, raw: "" };
  }
  try {
    const data = JSON.parse(trimmed);
    return { isValidJson: true, data, raw: trimmed };
  } catch (err) {
    return {
      isValidJson: false,
      error: `Malformed remediationNotes JSON: ${err.message}`,
      raw: trimmed,
      data: null,
    };
  }
}

/**
 * Deterministically evaluates whether a property meets all 6 criteria for pilot readiness
 */
function evaluatePilotReadiness(sanitized, metadata) {
  const blockingReasons = [];

  // 1. Property Existence
  const validExistence = ["PHYSICAL_SITE_VERIFIED", "MUNICIPAL_REGISTRY_CONFIRMED"].includes(metadata.propertyExistenceStatus);
  if (!validExistence || !metadata.propertyExistenceEvidenceVerified) {
    blockingReasons.push("Property existence is not confirmed with verified evidence in ledger.");
  }

  // 2. Host Authority
  const validHost = ["OWNER_DIRECT_CONFIRMED", "AUTHORIZED_MANAGER_CONFIRMED"].includes(metadata.hostAuthorityStatus);
  if (!validHost || !metadata.hostAuthorityEvidenceVerified) {
    blockingReasons.push("Host authority is not confirmed with verified agreement in ledger.");
  }

  // 3. Rate Verification
  const validRate = ["OWNER_RATE_CARD_CONFIRMED", "SEASONAL_PUBLISHED_CONFIRMED"].includes(metadata.rateVerificationStatus);
  if (!validRate || !metadata.rateEvidenceVerified) {
    blockingReasons.push("Nightly pricing is not confirmed with verified rate card in ledger.");
  }

  // 4. Coordinate Verification
  const validCoords = ["ROOFTOP_GEO_CONFIRMED", "ON_SITE_GPS_CONFIRMED"].includes(metadata.coordinateVerificationStatus);
  const isIndicativeCoord = metadata.coordinateSource === "INDICATIVE_LOCALITY_PIN" || metadata.coordinateVerificationStatus === "INDICATIVE_LOCALITY_PIN";
  if (!validCoords || metadata.isNearCentroid || !metadata.coordinateEvidenceVerified || isIndicativeCoord) {
    blockingReasons.push("Coordinates are not confirmed with rooftop/GPS evidence or flagged as regional centroid/indicative locality pin.");
  }

  // 5. Image Rights
  const validImage = ["OWNER_DIRECT_PERMISSION", "LICENSED_STOCK_VERIFIED"].includes(metadata.imagePermissionStatus);
  const isSampleUrl = Boolean(sanitized.image && sanitized.image.url && isPlaceholderImageUrl(sanitized.image.url));
  const isSampleStatus = metadata.imagePermissionStatus === "ILLUSTRATIVE_SAMPLE_UNSPLASH";
  const hasEmptyImage = !sanitized.image || !sanitized.image.url || !sanitized.image.url.trim();
  if (!validImage || !metadata.imagePermissionEvidenceVerified || isSampleUrl || isSampleStatus || hasEmptyImage) {
    blockingReasons.push("Image permission is not verified with commercial rights or uses illustrative sample photography.");
  }

  // 6. Editorial Approval
  if (metadata.editorialStatus !== "EDITORIAL_APPROVED" || !metadata.editorialEvidenceVerified) {
    blockingReasons.push(`Editorial copy is '${metadata.editorialStatus || "DRAFT"}', not 'EDITORIAL_APPROVED' with verified sign-off in ledger.`);
  }

  const isReady = blockingReasons.length === 0;
  return {
    isReadyForPilot: isReady,
    pilotReadiness: isReady ? "READY_FOR_PILOT" : "NOT_READY",
    blockingReasons,
  };
}

// Valid Mongoose Schema Enums from models/listing.js
const ALLOWED_PROPERTY_TYPES = [
  "Apartment",
  "Villa",
  "Cabin",
  "Cottage",
  "Studio",
  "Haveli",
  "House",
  "Resort",
  "Hotel",
  "Boat",
  "Other",
];

const ALLOWED_CATEGORIES = [
  "Trending",
  "Rooms",
  "Iconic Cities",
  "Mountains",
  "Castles",
  "Amazing Pools",
  "Camping",
  "Farms",
  "Arctic",
  "Domes",
  "Boats",
];

const ALLOWED_STATUSES = ["pending", "approved", "rejected", "draft"];

const ALLOWED_REMEDIATION_FLAGS = [
  "NONE",
  "LOCATION_UNCERTAIN",
  "GENERIC_REGION_CENTROID",
  "TITLE_LOCATION_MISMATCH",
  "TEST_DATA_REQUIRES_REVIEW",
  "RESOLVED_VERIFIED",
];

const ALLOWED_REMEDIATION_REVIEW_STATUSES = [
  "PENDING_ADMIN_REVIEW",
  "IN_REVIEW",
  "RESOLVED",
  "EXEMPT_REGIONAL",
];


// Validated Source Verification Statuses
const SOURCE_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "HOST_SUBMITTED",
  "ADMIN_VERIFIED",
  "PARTNER_FEED",
];

// India Geographic Bounding Box
const INDIA_BOUNDS = {
  minLng: 68.0,
  maxLng: 98.0,
  minLat: 8.0,
  maxLat: 38.0,
};

/**
 * Normalizes text for clean deduplication and comparison
 */
function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes a robust composite deduplication key
 * Format: "normalizedTitle|normalizedCity|normalizedLocality|normalizedSourceRef"
 */
function getDeduplicationKey(record) {
  const normTitle = normalizeText(record.title || "");
  const normCity = normalizeText(record.city || "");
  const normLocality = normalizeText(record.location || "");
  const normSource = normalizeText(record.sourceReference || "");
  return `${normTitle}|${normCity}|${normLocality}|${normSource}`;
}

/**
 * Returns an authoritative source reference key if available
 */
function getSourceKey(record) {
  const rawSource = record.sourceReference || "";
  const norm = normalizeText(rawSource);
  return norm ? `SRC:${norm}` : null;
}

/**
 * Returns a composite key incorporating title, city, and locality
 */
function getCompositeLocationKey(record) {
  const normTitle = normalizeText(record.title || "");
  const normCity = normalizeText(record.city || "");
  const normLocality = normalizeText(record.location || "");
  return `${normTitle}|${normCity}|${normLocality}`;
}

/**
 * Validates GeoJSON coordinates [longitude, latitude]
 * Order: [longitude, latitude]
 */
function validateCoordinates(coordinates, options = {}) {
  const errors = [];
  const warnings = [];
  const requireIndiaBounds = options.requireIndiaBounds !== false;

  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    errors.push("Coordinates must be an array of exactly 2 numbers: [longitude, latitude].");
    return { isValid: false, errors, warnings };
  }

  const [lng, lat] = coordinates;

  if (typeof lng !== "number" || typeof lat !== "number" || isNaN(lng) || isNaN(lat)) {
    errors.push("Longitude and Latitude must be valid numbers.");
    return { isValid: false, errors, warnings };
  }

  if (lng === 0 && lat === 0) {
    errors.push("Coordinates cannot be [0, 0] (Null Island).");
    return { isValid: false, errors, warnings };
  }

  // World bounds check
  if (lng < -180 || lng > 180) {
    errors.push(`Longitude ${lng} is outside the valid range [-180, 180].`);
  }
  if (lat < -90 || lat > 90) {
    errors.push(`Latitude ${lat} is outside the valid range [-90, 90].`);
  }

  // Transposed coordinate detection for India (lat in 68..98 and lng in 8..38)
  if (lat >= INDIA_BOUNDS.minLng && lat <= INDIA_BOUNDS.maxLng &&
      lng >= INDIA_BOUNDS.minLat && lng <= INDIA_BOUNDS.maxLat) {
    errors.push(
      `Transposed coordinates detected: latitude (${lat}) and longitude (${lng}) appear to be swapped. GeoJSON requires [longitude, latitude].`
    );
  } else if (requireIndiaBounds) {
    if (lng < INDIA_BOUNDS.minLng || lng > INDIA_BOUNDS.maxLng) {
      warnings.push(`Longitude ${lng} is outside standard mainland India bounds (68°E - 98°E).`);
    }
    if (lat < INDIA_BOUNDS.minLat || lat > INDIA_BOUNDS.maxLat) {
      warnings.push(`Latitude ${lat} is outside standard mainland India bounds (8°N - 38°N).`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
  };
}

/**
 * Checks if a URL is a known illustrative placeholder or stock sample URL
 */
function isPlaceholderImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return false;
  const lower = imageUrl.toLowerCase().trim();
  return (
    lower.includes("unsplash.com") ||
    lower.includes("images.unsplash.com") ||
    lower.includes("via.placeholder.com") ||
    lower.includes("placeholder.com") ||
    lower.includes("dummyimage.com") ||
    lower.includes("placekitten.com")
  );
}

/**
 * Validates HTTP/HTTPS image reachability and content-type
 * Note: Reaching an image URL does NOT grant copyright authorization.
 * 
 * Enforces mandatory rejection of placeholder/sample URLs and empty URLs.
 * In production or by default, rejectPlaceholders is unconditionally enforced.
 */
function verifyImageAccessibility(imageUrl, timeoutMs = 6000, options = {}) {
  return new Promise((resolve) => {
    if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
      return resolve({
        accessible: false,
        statusCode: null,
        contentType: null,
        isPlaceholder: false,
        error: "Missing or empty image URL.",
      });
    }

    const trimmedUrl = imageUrl.trim();

    // Mandatory placeholder rejection:
    // Unconditionally rejected in production, and enabled by default in all environments
    const isProduction = process.env.NODE_ENV === "production";
    const rejectPlaceholders = isProduction || options.rejectPlaceholders !== false;

    if (rejectPlaceholders && isPlaceholderImageUrl(trimmedUrl)) {
      return resolve({
        accessible: false,
        statusCode: null,
        contentType: null,
        isPlaceholder: true,
        error: "Placeholder or illustrative stock image URL rejected for live/pilot import.",
      });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return resolve({
          accessible: false,
          statusCode: null,
          contentType: null,
          isPlaceholder: false,
          error: `Unsupported protocol: ${parsedUrl.protocol}`,
        });
      }
    } catch (e) {
      return resolve({
        accessible: false,
        statusCode: null,
        contentType: null,
        isPlaceholder: false,
        error: `Invalid URL format: ${e.message}`,
      });
    }

    const client = parsedUrl.protocol === "https:" ? https : http;
    const reqOptions = {
      method: "HEAD",
      timeout: timeoutMs,
      headers: {
        "User-Agent": "WanderLust-BulkImporter-Validator/1.0",
      },
    };

    const req = client.request(parsedUrl, reqOptions, (res) => {
      // If HEAD is rejected with 405 Method Not Allowed, fallback to GET with range
      if (res.statusCode === 405) {
        return resolve(verifyViaGet(parsedUrl, client, timeoutMs));
      }

      const contentType = res.headers["content-type"] || "";
      const isImage = contentType.toLowerCase().startsWith("image/");
      const isSuccess = res.statusCode >= 200 && res.statusCode < 400;

      resolve({
        accessible: isSuccess && isImage,
        statusCode: res.statusCode,
        contentType,
        error: !isSuccess
          ? `HTTP ${res.statusCode}`
          : !isImage
          ? `Non-image Content-Type: ${contentType}`
          : null,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        accessible: false,
        statusCode: null,
        contentType: null,
        error: `Request timed out after ${timeoutMs}ms`,
      });
    });

    req.on("error", (err) => {
      resolve({
        accessible: false,
        statusCode: null,
        contentType: null,
        error: err.message,
      });
    });

    req.end();
  });
}

/**
 * Fallback GET verification when HEAD is not supported by host
 */
function verifyViaGet(parsedUrl, client, timeoutMs) {
  return new Promise((resolve) => {
    const reqOptions = {
      method: "GET",
      timeout: timeoutMs,
      headers: {
        "User-Agent": "WanderLust-BulkImporter-Validator/1.0",
        Range: "bytes=0-1024",
      },
    };

    const req = client.request(parsedUrl, reqOptions, (res) => {
      const contentType = res.headers["content-type"] || "";
      const isImage = contentType.toLowerCase().startsWith("image/");
      const isSuccess = res.statusCode >= 200 && res.statusCode < 400;

      // Abort connection as soon as headers are received
      req.destroy();

      resolve({
        accessible: isSuccess && isImage,
        statusCode: res.statusCode,
        contentType,
        error: !isSuccess
          ? `HTTP ${res.statusCode}`
          : !isImage
          ? `Non-image Content-Type: ${contentType}`
          : null,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        accessible: false,
        statusCode: null,
        contentType: null,
        error: `Fallback GET timed out after ${timeoutMs}ms`,
      });
    });

    req.on("error", (err) => {
      resolve({
        accessible: false,
        statusCode: null,
        contentType: null,
        error: err.message,
      });
    });

    req.end();
  });
}

/**
 * Validates a single listing record for bulk import
 *
 * @param {Object} rawRecord Raw input from CSV or JSON
 * @param {Object} options Configuration flags
 * @returns {Object} { isValid, errors, warnings, sanitized }
 */
async function validateListing(rawRecord, options = {}) {
  const errors = [];
  const warnings = [];

  // Validate incoming rawRecord.remediationNotes if provided
  if (rawRecord.remediationNotes && typeof rawRecord.remediationNotes === "string" && rawRecord.remediationNotes.trim()) {
    const checkNotes = parseRemediationNotes(rawRecord.remediationNotes);
    if (!checkNotes.isValidJson) {
      errors.push(`Input remediationNotes contains malformed JSON: ${checkNotes.error}`);
    }
  }

  // Required Field: title
  const title = (rawRecord.title || "").trim();
  if (!title) {
    errors.push("Property title is required and cannot be empty.");
  } else if (title.length < 5) {
    errors.push("Property title must be at least 5 characters long.");
  } else if (title.length > 150) {
    errors.push("Property title cannot exceed 150 characters.");
  }

  // Required Field: description
  const description = (rawRecord.description || "").trim();
  if (!description) {
    errors.push("Property description is required and cannot be empty.");
  } else if (description.length < 20) {
    errors.push("Property description must be at least 20 characters long.");
  }

  // Required Field: price
  const rawPrice = rawRecord.price;
  let price = Number(rawPrice);
  if (rawPrice === undefined || rawPrice === null || rawPrice === "" || isNaN(price)) {
    errors.push("Nightly price is required and must be a valid number.");
  } else if (price < 0) {
    errors.push("Price cannot be negative.");
  } else {
    if (price < 500) {
      warnings.push(`Unusually low price: ₹${price}/night.`);
    } else if (price > 500000) {
      warnings.push(`Unusually high price: ₹${price}/night.`);
    }
  }

  // Required Field: location (locality / neighborhood)
  const location = (rawRecord.location || "").trim();
  if (!location) {
    errors.push("Location (locality or destination area) is required.");
  }

  // Required Field: country
  const country = (rawRecord.country || "India").trim();
  if (!country) {
    errors.push("Country is required.");
  } else if (country.toLowerCase() !== "india") {
    warnings.push(`Expected country 'India', received '${country}'.`);
  }

  // Optional string fields
  const address = (rawRecord.address || "").trim();
  const city = (rawRecord.city || "").trim();
  const state = (rawRecord.state || "").trim();

  // Enum: propertyType
  let propertyType = (rawRecord.propertyType || "Apartment").trim();
  if (propertyType) {
    // Case-insensitive match against allowed property types
    const matchedType = ALLOWED_PROPERTY_TYPES.find(
      (t) => t.toLowerCase() === propertyType.toLowerCase()
    );
    if (matchedType) {
      propertyType = matchedType;
    } else {
      errors.push(
        `Invalid propertyType '${propertyType}'. Allowed values: ${ALLOWED_PROPERTY_TYPES.join(", ")}.`
      );
    }
  } else {
    propertyType = "Apartment";
  }

  // Enum: category
  let category = (rawRecord.category || "Trending").trim();
  if (category) {
    const matchedCategory = ALLOWED_CATEGORIES.find(
      (c) => c.toLowerCase() === category.toLowerCase()
    );
    if (matchedCategory) {
      category = matchedCategory;
    } else {
      errors.push(
        `Invalid category '${category}'. Allowed values: ${ALLOWED_CATEGORIES.join(", ")}.`
      );
    }
  } else {
    category = "Trending";
  }

  // Numerical guest & room capacities
  let maxGuests = Number(rawRecord.maxGuests || 2);
  if (isNaN(maxGuests) || maxGuests < 1 || maxGuests > 50) {
    errors.push("maxGuests must be a number between 1 and 50.");
  }

  let bedrooms = Number(rawRecord.bedrooms !== undefined && rawRecord.bedrooms !== "" ? rawRecord.bedrooms : 1);
  if (isNaN(bedrooms) || bedrooms < 0) {
    errors.push("bedrooms must be a non-negative number.");
  }

  let beds = Number(rawRecord.beds || 1);
  if (isNaN(beds) || beds < 1) {
    errors.push("beds must be at least 1.");
  }

  let bathrooms = Number(rawRecord.bathrooms || 1);
  if (isNaN(bathrooms) || bathrooms < 1) {
    errors.push("bathrooms must be at least 1.");
  }

  // Amenities: parse pipe-delimited or array
  let amenities = [];
  if (Array.isArray(rawRecord.amenities)) {
    amenities = rawRecord.amenities.map((a) => String(a).trim()).filter(Boolean);
  } else if (typeof rawRecord.amenities === "string" && rawRecord.amenities.trim()) {
    amenities = rawRecord.amenities
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean);
  }
  if (amenities.length === 0) {
    amenities = ["Wifi", "Air conditioning", "Kitchen"];
  }

  // Coordinates validation
  let coordinates = [];
  if (Array.isArray(rawRecord.coordinates)) {
    coordinates = rawRecord.coordinates.map(Number);
  } else if (rawRecord.longitude !== undefined && rawRecord.latitude !== undefined) {
    const lng = Number(rawRecord.longitude);
    const lat = Number(rawRecord.latitude);
    coordinates = [lng, lat];
  } else if (rawRecord.geometry && Array.isArray(rawRecord.geometry.coordinates)) {
    coordinates = rawRecord.geometry.coordinates.map(Number);
  }

  const coordResult = validateCoordinates(coordinates, {
    requireIndiaBounds: options.requireIndiaBounds !== false,
  });

  if (!coordResult.isValid) {
    errors.push(...coordResult.errors);
  }
  if (coordResult.warnings.length > 0) {
    warnings.push(...coordResult.warnings);
  }

  // Centroid proximity detection (Fix 4)
  const centroidCheck = coordResult.isValid
    ? checkCentroidProximity(coordResult.coordinates, city)
    : { isNearCentroid: false, distanceMeters: Infinity, matchedDestination: null };

  if (centroidCheck.isNearCentroid) {
    warnings.push(
      `Coordinates are within ${centroidCheck.distanceMeters}m of ${centroidCheck.matchedDestination}; flagged as GENERIC_REGION_CENTROID.`
    );
  }

  // Images parsing
  let coverImageUrl = (rawRecord.coverImageUrl || rawRecord.imageUrl || "").trim();
  let coverImageFilename = (rawRecord.coverImageFilename || rawRecord.imageFilename || "listingimage").trim();

  // If object provided in rawRecord.image
  if (!coverImageUrl && rawRecord.image && typeof rawRecord.image === "object") {
    coverImageUrl = (rawRecord.image.url || "").trim();
    coverImageFilename = (rawRecord.image.filename || "listingimage").trim();
  }

  // Gallery images
  let galleryImageUrls = [];
  if (Array.isArray(rawRecord.galleryImageUrls)) {
    galleryImageUrls = rawRecord.galleryImageUrls.map((u) => String(u).trim()).filter(Boolean);
  } else if (typeof rawRecord.galleryImageUrls === "string" && rawRecord.galleryImageUrls.trim()) {
    galleryImageUrls = rawRecord.galleryImageUrls
      .split("|")
      .map((u) => u.trim())
      .filter(Boolean);
  } else if (Array.isArray(rawRecord.images)) {
    galleryImageUrls = rawRecord.images.map((img) => (img.url || "").trim()).filter(Boolean);
  }

  // If no cover image provided, check default
  if (!coverImageUrl) {
    if (galleryImageUrls.length > 0) {
      coverImageUrl = galleryImageUrls[0];
    } else {
      coverImageUrl = "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=1200&q=80";
      warnings.push("No cover image URL supplied; defaulting to Unsplash sample placeholder.");
    }
  }

  // Build images array
  const formattedImages = [];
  if (galleryImageUrls.length > 0) {
    for (let i = 0; i < galleryImageUrls.length; i++) {
      formattedImages.push({
        url: galleryImageUrls[i],
        filename: `import_gallery_${i + 1}`,
      });
    }
  } else {
    formattedImages.push({
      url: coverImageUrl,
      filename: coverImageFilename,
    });
  }

  // Image network verification if requested
  if (options.verifyImageNetwork) {
    const rawCoverImageUrl = (rawRecord.coverImageUrl || rawRecord.imageUrl || "").trim();
    if (!rawCoverImageUrl) {
      errors.push("Missing or empty cover image URL: live import requires a genuine, reachable image.");
    }
    const urlsToCheck = [coverImageUrl, ...galleryImageUrls.slice(0, 3)].filter(Boolean);
    for (const imgUrl of urlsToCheck) {
      const check = await verifyImageAccessibility(imgUrl, options.networkTimeoutMs || 5000);
      if (!check.accessible) {
        errors.push(`Image verification failed for (${imgUrl}): ${check.error}`);
      }
    }
  }

  // =========================================================================
  // Six Independent Verification Dimensions (Phase 10.6 & 10.6.1)
  // =========================================================================

  // Dimension 1: Property Existence
  let propertyExistenceStatus = (rawRecord.propertyExistenceStatus || "UNVERIFIED").trim().toUpperCase();
  if (!PROPERTY_EXISTENCE_STATUSES.includes(propertyExistenceStatus)) {
    warnings.push(`Unknown propertyExistenceStatus '${propertyExistenceStatus}'. Defaulting to 'UNVERIFIED'.`);
    propertyExistenceStatus = "UNVERIFIED";
  }
  const rawPropEv = (rawRecord.propertyExistenceEvidence || "").trim();
  const propLedger = verifyEvidenceReference("PROPERTY_EXISTENCE", rawPropEv);
  if (["PHYSICAL_SITE_VERIFIED", "MUNICIPAL_REGISTRY_CONFIRMED"].includes(propertyExistenceStatus) && !propLedger.verified) {
    errors.push(
      `propertyExistenceStatus '${propertyExistenceStatus}' requires verified ledger evidence in dimension 'PROPERTY_EXISTENCE'. ${propLedger.reason}`
    );
  }

  // Dimension 2: Host Authority
  let hostAuthorityStatus = (rawRecord.hostAuthorityStatus || "UNVERIFIED").trim().toUpperCase();
  if (!HOST_AUTHORITY_STATUSES.includes(hostAuthorityStatus)) {
    warnings.push(`Unknown hostAuthorityStatus '${hostAuthorityStatus}'. Defaulting to 'UNVERIFIED'.`);
    hostAuthorityStatus = "UNVERIFIED";
  }
  const rawHostEv = (rawRecord.hostAuthorityEvidence || "").trim();
  const hostLedger = verifyEvidenceReference("HOST_AUTHORITY", rawHostEv);
  if (["OWNER_DIRECT_CONFIRMED", "AUTHORIZED_MANAGER_CONFIRMED"].includes(hostAuthorityStatus) && !hostLedger.verified) {
    errors.push(
      `hostAuthorityStatus '${hostAuthorityStatus}' requires verified agreement in ledger in dimension 'HOST_AUTHORITY'. ${hostLedger.reason}`
    );
  }

  // Dimension 3: Rate Verification
  let rateVerificationStatus = (rawRecord.rateVerificationStatus || "UNVERIFIED").trim().toUpperCase();
  if (!RATE_VERIFICATION_STATUSES.includes(rateVerificationStatus)) {
    warnings.push(`Unknown rateVerificationStatus '${rateVerificationStatus}'. Defaulting to 'UNVERIFIED'.`);
    rateVerificationStatus = "UNVERIFIED";
  }
  const rawRateEv = (rawRecord.rateVerificationEvidence || "").trim();
  const rateLedger = verifyEvidenceReference("RATE", rawRateEv);
  if (["OWNER_RATE_CARD_CONFIRMED", "SEASONAL_PUBLISHED_CONFIRMED"].includes(rateVerificationStatus) && !rateLedger.verified) {
    errors.push(
      `rateVerificationStatus '${rateVerificationStatus}' requires verified rate card in evidence ledger in dimension 'RATE'. ${rateLedger.reason}`
    );
  }

  // Dimension 4: Coordinate Verification
  let coordinateVerificationStatus = (rawRecord.coordinateVerificationStatus || "UNVERIFIED").trim().toUpperCase();
  if (!COORDINATE_VERIFICATION_STATUSES.includes(coordinateVerificationStatus)) {
    warnings.push(`Unknown coordinateVerificationStatus '${coordinateVerificationStatus}'. Defaulting to 'UNVERIFIED'.`);
    coordinateVerificationStatus = "UNVERIFIED";
  }

  // Parse and validate coordinateSource against ALLOWED_COORDINATE_SOURCES
  let coordinateSource = (rawRecord.coordinateSource || "").trim().toUpperCase();
  if (!coordinateSource) {
    coordinateSource = coordResult.isValid ? "GEOJSON_INPUT" : "UNRESOLVED";
  } else if (!ALLOWED_COORDINATE_SOURCES.includes(coordinateSource)) {
    warnings.push(`Unrecognized coordinateSource '${coordinateSource}'. Defaulting to 'UNRESOLVED'.`);
    coordinateSource = "UNRESOLVED";
  }

  // Centroid downgrade and blocking
  if (centroidCheck.isNearCentroid) {
    if (["ROOFTOP_GEO_CONFIRMED", "ON_SITE_GPS_CONFIRMED"].includes(coordinateVerificationStatus)) {
      coordinateVerificationStatus = "REGIONAL_CENTROID_WARNING";
      errors.push(
        `Coordinates are within 200m of destination center (${centroidCheck.distanceMeters}m from ${centroidCheck.matchedDestination}); cannot be marked confirmed without independent on-site rooftop evidence.`
      );
    } else {
      coordinateVerificationStatus = "REGIONAL_CENTROID_WARNING";
    }
  }

  // Security Gate: INDICATIVE_LOCALITY_PIN is an unverified locality pin
  // It can NEVER be declared or interpreted as rooftop, GPS, or verified coordinates
  if (coordinateSource === "INDICATIVE_LOCALITY_PIN") {
    if (
      coordinateVerificationStatus === "ROOFTOP_GEO_CONFIRMED" ||
      coordinateVerificationStatus === "ON_SITE_GPS_CONFIRMED"
    ) {
      errors.push(
        `coordinateSource 'INDICATIVE_LOCALITY_PIN' cannot be declared as '${coordinateVerificationStatus}'. Indicative locality coordinates are unverified and cannot represent rooftop/GPS verification.`
      );
      coordinateVerificationStatus = "UNVERIFIED";
    }
  }

  const rawCoordEv = (rawRecord.coordinateEvidence || "").trim();
  const coordLedger = verifyEvidenceReference("COORDINATE", rawCoordEv);
  if (["ROOFTOP_GEO_CONFIRMED", "ON_SITE_GPS_CONFIRMED"].includes(coordinateVerificationStatus) && !coordLedger.verified) {
    errors.push(
      `coordinateVerificationStatus '${coordinateVerificationStatus}' requires verified GPS/rooftop evidence in dimension 'COORDINATE'. ${coordLedger.reason}`
    );
  }

  // Dimension 5: Image Rights & Permission
  let imagePermissionStatus = (rawRecord.imagePermissionStatus || "UNVERIFIED").trim().toUpperCase();
  if (!IMAGE_PERMISSION_STATUSES.includes(imagePermissionStatus)) {
    warnings.push(`Unknown imagePermissionStatus '${imagePermissionStatus}'. Defaulting to 'UNVERIFIED'.`);
    imagePermissionStatus = "UNVERIFIED";
  }
  // Specific constraint: COMMERCIAL_LICENSE_VERIFIED cannot be assigned without evidence
  if (rawRecord.remediationFlag === "COMMERCIAL_LICENSE_VERIFIED" || rawRecord.imagePermissionStatus === "COMMERCIAL_LICENSE_VERIFIED") {
    errors.push("COMMERCIAL_LICENSE_VERIFIED cannot be assigned without verifiable license documentation.");
  }
  const rawImgEv = (rawRecord.imagePermissionEvidence || "").trim();
  const imgLedger = verifyEvidenceReference("IMAGE_PERMISSION", rawImgEv);
  if (["OWNER_DIRECT_PERMISSION", "LICENSED_STOCK_VERIFIED"].includes(imagePermissionStatus) && !imgLedger.verified) {
    errors.push(
      `imagePermissionStatus '${imagePermissionStatus}' requires verified license/release agreement in evidence ledger in dimension 'IMAGE_PERMISSION'. ${imgLedger.reason}`
    );
  }

  // Dimension 6: Editorial Approval
  let editorialStatus = (rawRecord.editorialStatus || "DRAFT").trim().toUpperCase();
  if (!EDITORIAL_STATUSES.includes(editorialStatus)) {
    warnings.push(`Unknown editorialStatus '${editorialStatus}'. Defaulting to 'DRAFT'.`);
    editorialStatus = "DRAFT";
  }
  const rawEditorialEv = (rawRecord.editorialEvidence || rawRecord.editorialApprovalReference || "").trim();
  const editorialLedger = verifyEvidenceReference("EDITORIAL", rawEditorialEv);
  if (editorialStatus === "EDITORIAL_APPROVED" && !editorialLedger.verified) {
    errors.push(
      `editorialStatus 'EDITORIAL_APPROVED' requires verified editorial review sign-off in evidence ledger in dimension 'EDITORIAL'. ${editorialLedger.reason}`
    );
  }

  // Legacy Source Verification Status
  let sourceVerificationStatus = (rawRecord.sourceVerificationStatus || "UNVERIFIED").trim().toUpperCase();
  if (!SOURCE_VERIFICATION_STATUSES.includes(sourceVerificationStatus)) {
    sourceVerificationStatus = "UNVERIFIED";
  }

  const sourceReference = (rawRecord.sourceReference || "").trim();
  const ownerAuthorizationReference = (rawRecord.ownerAuthorizationReference || hostLedger.pointer).trim();
  const verificationDate = (rawRecord.verificationDate || "").trim();

  // Security & Business Rules Enforcements:
  // All imported records MUST remain status: "pending" and isPublished: false
  const status = "pending";
  const isPublished = false;
  const featured = Boolean(rawRecord.featured === true || rawRecord.featured === "true");

  // Construct structured remediation metadata with the 6 dimensions
  const remediationMetadata = {
    importBatchId: options.batchId || "BULK_IMPORT_PHASE_10",
    sourceReference: sourceReference || "",
    // Six Independent Dimensions
    propertyExistenceStatus,
    propertyExistenceEvidence: propLedger.pointer,
    propertyExistenceEvidenceVerified: propLedger.verified,
    hostAuthorityStatus,
    hostAuthorityEvidence: hostLedger.pointer,
    hostAuthorityEvidenceVerified: hostLedger.verified,
    rateVerificationStatus,
    rateVerificationEvidence: rateLedger.pointer,
    rateEvidenceVerified: rateLedger.verified,
    coordinateVerificationStatus,
    coordinateEvidence: coordLedger.pointer,
    coordinateEvidenceVerified: coordLedger.verified,
    coordinateSource,
    isNearCentroid: centroidCheck.isNearCentroid,
    distanceToCentroidMeters: centroidCheck.distanceMeters,
    imagePermissionStatus,
    imagePermissionEvidence: imgLedger.pointer,
    imagePermissionEvidenceVerified: imgLedger.verified,
    editorialStatus,
    editorialEvidence: editorialLedger.pointer,
    editorialEvidenceVerified: editorialLedger.verified,
    // General / Legacy pointers
    sourceVerificationStatus,
    sourceVerificationEvidence: propLedger.pointer,
    ownerAuthorizationReference,
    verificationDate,
    notes: (rawRecord.notes || "").trim(),
    importTimestamp: options.timestamp || new Date().toISOString(),
  };

  let remediationFlag = "NONE";
  if (centroidCheck.isNearCentroid) {
    remediationFlag = "GENERIC_REGION_CENTROID";
  } else if (
    !coordResult.isValid ||
    coordinateVerificationStatus === "UNVERIFIED" ||
    coordinateSource === "INDICATIVE_LOCALITY_PIN" ||
    coordinateSource === "UNRESOLVED"
  ) {
    remediationFlag = "LOCATION_UNCERTAIN";
  } else if (
    coordinateVerificationStatus === "ROOFTOP_GEO_CONFIRMED" ||
    coordinateVerificationStatus === "ON_SITE_GPS_CONFIRMED"
  ) {
    remediationFlag = "RESOLVED_VERIFIED";
  }

  const sanitized = {
    title,
    description,
    propertyType,
    category,
    price,
    location,
    address,
    city,
    state,
    country,
    maxGuests,
    bedrooms,
    beds,
    bathrooms,
    amenities,
    geometry: {
      type: "Point",
      coordinates: coordResult.coordinates || [0, 0],
    },
    image: {
      url: coverImageUrl,
      filename: coverImageFilename,
    },
    images: formattedImages,
    status,
    isPublished,
    featured,
    coordinateSource,
    remediationFlag,
    remediationReviewStatus: "PENDING_ADMIN_REVIEW",
    remediationNotes: JSON.stringify(remediationMetadata),
    sourceReference,
  };

  // Evaluate Pilot Readiness (Fix 6)
  const pilotEval = evaluatePilotReadiness(sanitized, remediationMetadata);
  remediationMetadata.isReadyForPilot = pilotEval.isReadyForPilot;
  remediationMetadata.pilotReadiness = pilotEval.pilotReadiness;
  remediationMetadata.pilotBlockingReasons = pilotEval.blockingReasons;
  // Re-serialize with pilot readiness
  sanitized.remediationNotes = JSON.stringify(remediationMetadata);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitized,
    deduplicationKey: getDeduplicationKey(sanitized),
    pilotReadiness: pilotEval.pilotReadiness,
    isReadyForPilot: pilotEval.isReadyForPilot,
    blockingReasons: pilotEval.blockingReasons,
    coordinateVerificationStatus: remediationMetadata.coordinateVerificationStatus,
  };
}

module.exports = {
  validateListing,
  validateCoordinates,
  verifyImageAccessibility,
  isPlaceholderImageUrl,
  getDeduplicationKey,
  getSourceKey,
  getCompositeLocationKey,
  normalizeText,
  calculateHaversineDistanceMeters,
  checkCentroidProximity,
  parseRemediationNotes,
  evaluatePilotReadiness,
  PROPERTY_EXISTENCE_STATUSES,
  HOST_AUTHORITY_STATUSES,
  RATE_VERIFICATION_STATUSES,
  COORDINATE_VERIFICATION_STATUSES,
  ALLOWED_COORDINATE_SOURCES,
  IMAGE_PERMISSION_STATUSES,
  EDITORIAL_STATUSES,
  DESTINATION_CENTROIDS,
  ALLOWED_PROPERTY_TYPES,
  ALLOWED_CATEGORIES,
  ALLOWED_STATUSES,
  ALLOWED_REMEDIATION_FLAGS,
  ALLOWED_REMEDIATION_REVIEW_STATUSES,
  SOURCE_VERIFICATION_STATUSES,
  INDIA_BOUNDS,
};
