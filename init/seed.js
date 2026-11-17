if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const mongoose = require("mongoose");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
const dbUrl =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || MONGO_URL
    : process.env.MONGO_URL || MONGO_URL;

const sampleListings = [
  {
    title: "Luxury Sea-Facing Penthouse",
    description:
      "Perched high above the Arabian Sea along Bandra's iconic coastline, this designer penthouse offers unobstructed ocean panoramas, floor-to-ceiling glass, Italian marble interiors, and a private sunset deck. Perfect for executive stays and premium getaways in Mumbai.",
    image: {
      url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
      filename: "penthouse_mumbai",
    },
    price: 12500,
    location: "Bandra West, Mumbai",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: [
      "Wifi",
      "Air conditioning",
      "Kitchen",
      "Dedicated workspace",
      "Sea view",
      "Elevator",
      "Free parking",
      "TV",
    ],
    isPublished: true,
    featured: true,
    geometry: {
      type: "Point",
      coordinates: [72.8258, 19.0596], // Longitude, Latitude for Bandra West, Mumbai
    },
  },
  {
    title: "The Himalayan Cedar Cabin",
    description:
      "Handcrafted from reclaimed Himalayan deodar wood and river stones, this cozy mountain retreat sits among ancient pine trees in Old Manali. Cozy up beside the stone wood-burning fireplace while gazing at snow-capped peaks across the Beas valley.",
    image: {
      url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80",
      filename: "cabin_manali",
    },
    price: 4800,
    location: "Old Manali, Manali",
    country: "India",
    category: "Mountains",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: [
      "Wifi",
      "Indoor fireplace",
      "Mountain view",
      "Dedicated workspace",
      "Kitchen",
      "Free parking",
      "Balcony",
    ],
    isPublished: true,
    featured: true,
    geometry: {
      type: "Point",
      coordinates: [77.1887, 32.2568], // Manali
    },
  },
  {
    title: "Sunset Palms Beachfront Villa",
    description:
      "Direct beach gate access on the sun-kissed shores of Candolim. This tropical villa features an open-concept living pavilion, private plunge pool surrounded by swaying coconut palms, lush lawns, and dedicated housekeeping. Step barefoot straight onto the golden sand.",
    image: {
      url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80",
      filename: "villa_goa",
    },
    price: 18000,
    location: "Candolim, Goa",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Villa",
    maxGuests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 4,
    amenities: [
      "Wifi",
      "Pool",
      "Air conditioning",
      "Beach access",
      "Kitchen",
      "BBQ grill",
      "Free parking",
      "Chef available",
    ],
    isPublished: true,
    featured: true,
    geometry: {
      type: "Point",
      coordinates: [73.7667, 15.5186], // Candolim, Goa
    },
  },
  {
    title: "Minimalist Nordic Studio",
    description:
      "Nestled inside tree-lined Koregaon Park, this sunlight-drenched Scandinavian-style studio features custom oak furnishings, an espresso bar, fast fiber WiFi, and a lush balcony. Walking distance to Pune's top artisanal cafes, bakeries, and yoga centers.",
    image: {
      url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
      filename: "studio_pune",
    },
    price: 2900,
    location: "Koregaon Park, Pune",
    country: "India",
    category: "Rooms",
    propertyType: "Studio",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: [
      "Wifi",
      "Air conditioning",
      "Kitchen",
      "Dedicated workspace",
      "Balcony",
      "Elevator",
    ],
    isPublished: true,
    featured: false,
    geometry: {
      type: "Point",
      coordinates: [73.8967, 18.5362], // Koregaon Park, Pune
    },
  },
  {
    title: "Mist & Meadows Infinity Pool Cottage",
    description:
      "Perched atop the tranquil hills of Tungarli overlooking Lonavala's misty valleys. Features a heated cliffside infinity pool, landscaped garden, outdoor barbecue pit, and floor-to-ceiling glass windows that welcome the morning clouds.",
    image: {
      url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80",
      filename: "cottage_lonavala",
    },
    price: 9500,
    location: "Tungarli, Lonavala",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Cottage",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: [
      "Wifi",
      "Pool",
      "Air conditioning",
      "Mountain view",
      "BBQ grill",
      "Free parking",
      "Kitchen",
    ],
    isPublished: true,
    featured: true,
    geometry: {
      type: "Point",
      coordinates: [73.4072, 18.7546], // Lonavala
    },
  },
  {
    title: "Skyline Glass Penthouse Suite",
    description:
      "A duplex glasshouse apartment located on 100ft Road in Indiranagar, Bengaluru's vibrant dining and shopping hub. Features double-height ceilings, a private terrace with city skyline views, bespoke artwork, and a chef's kitchen.",
    image: {
      url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
      filename: "suite_bengaluru",
    },
    price: 5200,
    location: "Indiranagar, Bengaluru",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 2,
    amenities: [
      "Wifi",
      "Air conditioning",
      "Kitchen",
      "Dedicated workspace",
      "City skyline view",
      "Elevator",
      "Free parking",
    ],
    isPublished: true,
    featured: false,
    geometry: {
      type: "Point",
      coordinates: [77.6412, 12.9784], // Indiranagar, Bengaluru
    },
  },
  {
    title: "Royal Rajputana Heritage Haveli",
    description:
      "Step back into royal history in this restored 18th-century Rajput haveli in Jaipur's Civil Lines. Marvel at hand-carved stone arches, intricate frescoes, courtyard fountains, and royal chandeliers. Includes personalized concierge and morning peacocks in the garden.",
    image: {
      url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
      filename: "haveli_jaipur",
    },
    price: 14000,
    location: "Civil Lines, Jaipur",
    country: "India",
    category: "Castles",
    propertyType: "Haveli",
    maxGuests: 10,
    bedrooms: 5,
    beds: 6,
    bathrooms: 5,
    amenities: [
      "Wifi",
      "Pool",
      "Air conditioning",
      "Courtyard",
      "Kitchen",
      "Breakfast included",
      "Free parking",
      "Security cameras",
    ],
    isPublished: true,
    featured: true,
    geometry: {
      type: "Point",
      coordinates: [75.7873, 26.9124], // Civil Lines, Jaipur
    },
  },
  {
    title: "Lake Pichola Boutique Water Suite",
    description:
      "Overlooking the shimmering waters of Lake Pichola and the City Palace of Udaipur. Watch traditional boats glide past your private balcony jharokha. Features traditional Mewari textiles, copper bathtub, and rooftop dining under star-filled skies.",
    image: {
      url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80",
      filename: "suite_udaipur",
    },
    price: 8500,
    location: "Old City, Udaipur",
    country: "India",
    category: "Boats",
    propertyType: "Hotel",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: [
      "Wifi",
      "Air conditioning",
      "Lake view",
      "Balcony",
      "Breakfast included",
      "TV",
    ],
    isPublished: true,
    featured: true,
    geometry: {
      type: "Point",
      coordinates: [73.6833, 24.5764], // Udaipur
    },
  },
  {
    title: "Forest Geodesic Glamping Dome",
    description:
      "Experience high-altitude stargazing from a futuristic geodesic glass dome nestled within pristine pine forests along the Parvati River. Comes with cozy down duvets, outdoor fire pit, electric blankets, and breathtaking mountain view panoramas.",
    image: {
      url: "https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1200&q=80",
      filename: "dome_kasol",
    },
    price: 3800,
    location: "Kasol, Himachal Pradesh",
    country: "India",
    category: "Domes",
    propertyType: "Other",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: [
      "Mountain view",
      "Fire pit",
      "Heating",
      "Breakfast included",
      "Free parking",
    ],
    isPublished: true,
    featured: false,
    geometry: {
      type: "Point",
      coordinates: [77.315, 32.01], // Kasol
    },
  },
  {
    title: "Organic Coffee Estate Farmhouse",
    description:
      "Immerse yourself in a 50-acre working Arabica coffee and pepper plantation in Coorg. Wake up to misty morning walks, bird-watching tours, traditional Kodava home-cooked feasts, and plantation walks guided by the resident estate manager.",
    image: {
      url: "https://images.unsplash.com/photo-1500076656116-558758c991c1?auto=format&fit=crop&w=1200&q=80",
      filename: "farm_coorg",
    },
    price: 6200,
    location: "Madikeri, Coorg",
    country: "India",
    category: "Farms",
    propertyType: "Cottage",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 2,
    amenities: [
      "Wifi",
      "Free parking",
      "Kitchen",
      "Breakfast included",
      "Indoor fireplace",
      "Garden",
    ],
    isPublished: true,
    featured: false,
    geometry: {
      type: "Point",
      coordinates: [75.7382, 12.4244], // Madikeri, Coorg
    },
  },
  {
    title: "Snowview Luxury Glass Igloo",
    description:
      "Perched on the snowy slopes of Gulmarg, this thermal-insulated glass igloo lets you sleep beneath snowfall and clear Himalayan starlight. Features private underfloor heating, hot cocoa bar, ski-in/ski-out access, and direct view of Apharwat Peak.",
    image: {
      url: "https://images.unsplash.com/photo-1517824806704-9040b037703b?auto=format&fit=crop&w=1200&q=80",
      filename: "arctic_gulmarg",
    },
    price: 16500,
    location: "Gulmarg, Jammu and Kashmir",
    country: "India",
    category: "Arctic",
    propertyType: "Cabin",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: [
      "Wifi",
      "Heating",
      "Ski-in/ski-out",
      "Mountain view",
      "Breakfast included",
      "Hot tub",
    ],
    isPublished: true,
    featured: true,
    geometry: {
      type: "Point",
      coordinates: [74.3805, 34.0484], // Gulmarg
    },
  },
  {
    title: "Backwater Heritage Houseboat",
    description:
      "Cruise through the tranquil palm-fringed canals of Alleppey aboard a traditional Kerala Kettuvallam crafted with eco-friendly bamboo and coir. Savor freshly prepared Karimeen fish fry, tropical coconuts, and watch village life unfold on the waters.",
    image: {
      url: "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&w=1200&q=80",
      filename: "houseboat_kerala",
    },
    price: 11000,
    location: "Alleppey, Kerala",
    country: "India",
    category: "Boats",
    propertyType: "Other",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: [
      "Air conditioning",
      "Meals included",
      "Lake view",
      "Balcony",
      "Personal crew",
    ],
    isPublished: true,
    featured: false,
    geometry: {
      type: "Point",
      coordinates: [76.3388, 9.4981], // Alleppey, Kerala
    },
  },
];

async function seedDatabase() {
  await mongoose.connect(dbUrl);
  console.log("Connected to MongoDB for high-quality property seeding.");

  // Find or create an owner account
  let owner = await User.findOne({ role: "admin" });
  if (!owner) {
    owner = await User.findOne({});
  }
  if (!owner) {
    owner = new User({
      username: "admin",
      email: "admin@wanderlust.com",
      role: "admin",
    });
    owner = await User.register(owner, "admin123");
  }

  console.log(`Using owner: ${owner.username} (${owner._id})`);

  let addedCount = 0;
  let updatedCount = 0;

  for (const item of sampleListings) {
    const existing = await Listing.findOne({ title: item.title });
    if (existing) {
      // Update with full coordinates and metadata without duplicating
      Object.assign(existing, item, { owner: owner._id });
      await existing.save();
      updatedCount++;
    } else {
      const newListing = new Listing({
        ...item,
        owner: owner._id,
      });
      await newListing.save();
      addedCount++;
    }
  }

  // Also ensure any existing legacy listings have valid coordinates so Mapbox never crashes
  const uncoordinated = await Listing.find({
    $or: [{ geometry: { $exists: false } }, { "geometry.coordinates": { $exists: false } }],
  });
  for (const l of uncoordinated) {
    l.geometry = { type: "Point", coordinates: [72.8777, 19.076] };
    if (!l.maxGuests) l.maxGuests = 2;
    if (typeof l.isPublished === "undefined") l.isPublished = true;
    await l.save();
  }

  console.log(`Seeding complete! Added: ${addedCount}, Updated: ${updatedCount}.`);
  console.log(`Patched ${uncoordinated.length} legacy listings with valid coordinates.`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
  process.exit(0);
}

seedDatabase().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
