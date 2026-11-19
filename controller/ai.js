const Listing = require("../models/listing.js");

// In-memory rate limiting map: ip -> [timestamps]
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return false;
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, valid);
    }
  }
}, 5 * 60 * 1000);

module.exports.chat = async (req, res) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local";

  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      error: "Too many AI assistant requests. Please wait a minute before asking again.",
    });
  }

  const { message } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Please provide a valid question or travel query." });
  }

  const query = message.trim();
  if (query.length > 500) {
    return res.status(400).json({ error: "Query is too long. Please keep under 500 characters." });
  }

  const lower = query.toLowerCase();

  // Enforce identical public visibility criteria as /listings (never expose pending/draft/rejected/unpublished)
  const publicVisibilityFilter = {
    isPublished: { $ne: false },
    status: { $nin: ["pending", "rejected", "draft"] },
  };
  const andConditions = [publicVisibilityFilter];

  // 1. Destination / Location Extraction
  const locations = [
    "mumbai", "goa", "manali", "shimla", "jaipur", "udaipur", "jodhpur", "jaisalmer",
    "kerala", "alleppey", "munnar", "wayanad", "kochi", "varkala", "bengaluru", "bangalore",
    "coorg", "gokarna", "chikmagalur", "hampi", "mysore", "rishikesh", "mussoorie",
    "nainital", "auli", "srinagar", "gulmarg", "pahalgam", "leh", "ladakh", "pondicherry",
    "ooty", "kodaikanal", "darjeeling", "gangtok", "shillong", "varanasi", "agra", "alibaug",
    "lonavala", "pune", "mahabaleshwar", "kutch", "andaman", "havelock"
  ];

  let detectedLocation = null;
  for (const loc of locations) {
    if (lower.includes(loc)) {
      detectedLocation = loc;
      if (loc === "bangalore") detectedLocation = "bengaluru";
      break;
    }
  }

  if (detectedLocation) {
    andConditions.push({
      $or: [
        { location: { $regex: detectedLocation, $options: "i" } },
        { country: { $regex: detectedLocation, $options: "i" } },
        { title: { $regex: detectedLocation, $options: "i" } },
        { description: { $regex: detectedLocation, $options: "i" } },
      ],
    });
  }

  // 2. Budget / Max Price Extraction (e.g. "under 5000", "below 10000", "under ₹6,000")
  const priceMatch = lower.match(/(?:under|below|less than|max|budget of)\s*(?:rs\.?|inr|₹)?\s*([0-9]+(?:,[0-9]+)?)/i);
  let maxPrice = null;
  if (priceMatch && priceMatch[1]) {
    maxPrice = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(maxPrice) && maxPrice > 0) {
      andConditions.push({ price: { $lte: maxPrice } });
    }
  }

  // 3. Guest count (e.g. "for 4 people", "4 guests", "couple", "family")
  const guestMatch = lower.match(/(?:for|with)\s*([0-9]+)\s*(?:guests?|people|persons?|adults?)/i);
  let guestCount = null;
  if (guestMatch && guestMatch[1]) {
    guestCount = parseInt(guestMatch[1], 10);
    if (!isNaN(guestCount)) {
      andConditions.push({ maxGuests: { $gte: guestCount } });
    }
  } else if (lower.includes("couple")) {
    guestCount = 2;
  } else if (lower.includes("family") || lower.includes("group")) {
    guestCount = 4;
    andConditions.push({ maxGuests: { $gte: 4 } });
  }

  // 4. Property Type Extraction
  const propertyTypes = ["villa", "cabin", "cottage", "apartment", "studio", "haveli", "boat", "house", "resort"];
  let detectedType = null;
  for (const t of propertyTypes) {
    if (lower.includes(t)) {
      detectedType = t.charAt(0).toUpperCase() + t.slice(1);
      andConditions.push({ propertyType: detectedType });
      break;
    }
  }

  // 5. Amenities Extraction
  const amenityKeywords = [
    { word: "pool", match: "Pool" },
    { word: "wifi", match: "Wifi" },
    { word: "kitchen", match: "Kitchen" },
    { word: "fireplace", match: "Indoor fireplace" },
    { word: "sea view", match: "Sea view" },
    { word: "mountain view", match: "Mountain view" },
    { word: "beach", match: "Beach access" },
    { word: "parking", match: "Free parking" },
  ];

  for (const ak of amenityKeywords) {
    if (lower.includes(ak.word)) {
      andConditions.push({ amenities: { $regex: ak.match, $options: "i" } });
    }
  }

  // Query MongoDB
  let filter = andConditions.length > 0 ? { $and: andConditions } : publicVisibilityFilter;
  let recommendations = await Listing.find(filter)
    .populate("owner", "username")
    .sort({ featured: -1, createdAt: -1 })
    .limit(4);

  // If strict filter yielded 0 results, fall back to broader location or trending search
  if (recommendations.length === 0) {
    if (detectedLocation) {
      recommendations = await Listing.find({
        ...publicVisibilityFilter,
        $or: [
          { location: { $regex: detectedLocation, $options: "i" } },
          { title: { $regex: detectedLocation, $options: "i" } },
        ],
      })
        .populate("owner", "username")
        .sort({ price: 1 })
        .limit(3);
    } else {
      recommendations = await Listing.find({ ...publicVisibilityFilter, featured: true })
        .populate("owner", "username")
        .sort({ createdAt: -1 })
        .limit(3);
    }
  }

  // Build conversational response
  let reply = "";
  if (recommendations.length > 0) {
    const filtersMentioned = [];
    if (detectedLocation) filtersMentioned.push(`in **${detectedLocation.toUpperCase()}**`);
    if (maxPrice) filtersMentioned.push(`under **₹${maxPrice.toLocaleString("en-IN")}**`);
    if (detectedType) filtersMentioned.push(`as a **${detectedType}**`);
    if (guestCount) filtersMentioned.push(`for **${guestCount} guests**`);

    const contextStr = filtersMentioned.length > 0 ? filtersMentioned.join(", ") : "our handpicked stays";

    reply = `I found **${recommendations.length}** wonderful properties matching ${contextStr}:\n\n`;

    recommendations.forEach((item, idx) => {
      reply += `**${idx + 1}. [${item.title}](/listings/${item._id})**\n`;
      reply += `📍 ${item.location}, ${item.country} · 🏷️ **₹${item.price.toLocaleString("en-IN")}/night**\n`;
      reply += `🏠 ${item.propertyType || "Stay"} · 👥 Up to ${item.maxGuests || 2} guests · Host: @${item.owner ? item.owner.username : "Host"}\n`;
      if (item.amenities && item.amenities.length > 0) {
        reply += `✨ Highlights: ${item.amenities.slice(0, 3).join(", ")}\n`;
      }
      reply += `\n`;
    });

    reply += `Would you like me to refine this with specific check-in dates, amenities like pools, or alternative price ranges?`;
  } else {
    reply = `I couldn't find any listings matching those exact criteria right now. You can try searching with a broader location like "Goa", "Manali", or "Mumbai", or adjusting your budget.`;
  }

  res.json({
    reply,
    recommendations: recommendations.map((r) => ({
      _id: r._id,
      title: r.title,
      price: r.price,
      location: r.location,
      propertyType: r.propertyType,
      maxGuests: r.maxGuests,
      imageUrl: r.image && r.image.url ? r.image.url : null,
    })),
  });
};
