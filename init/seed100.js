/**
 * 100 Realistic Sample Listings for WanderLust Marketplace
 * Idempotent Seed Script
 * Run with: npm run seed:100 (or node init/seed100.js)
 */

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

// Hosts to bootstrap
const hostProfiles = [
  { username: "aarav_mumbai", email: "aarav.mumbai@wanderlust.in", role: "host" },
  { username: "priya_goa", email: "priya.goa@wanderlust.in", role: "host" },
  { username: "rohan_manali", email: "rohan.manali@wanderlust.in", role: "host" },
  { username: "ananya_jaipur", email: "ananya.jaipur@wanderlust.in", role: "host" },
  { username: "vikram_kerala", email: "vikram.kerala@wanderlust.in", role: "host" },
  { username: "meera_bangalore", email: "meera.bangalore@wanderlust.in", role: "host" },
  { username: "kabir_himalayas", email: "kabir.himalayas@wanderlust.in", role: "host" },
  { username: "neha_heritage", email: "neha.heritage@wanderlust.in", role: "host" },
];

const listings100 = [
  // 1-10: Mumbai & Maharashtra
  {
    title: "Luxury Sea-Facing Penthouse Bandra",
    description: "Perched high above the Arabian Sea along Bandra's iconic coastline, this designer penthouse offers unobstructed ocean panoramas, floor-to-ceiling glass, Italian marble interiors, and a private sunset deck. Perfect for executive stays and premium getaways in Mumbai.",
    images: [
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80", filename: "mumbai_pent_1" },
      { url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80", filename: "mumbai_pent_2" },
      { url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80", filename: "mumbai_pent_3" }
    ],
    price: 14500,
    location: "Bandra West, Mumbai",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Kitchen", "Dedicated workspace", "Sea view", "Elevator", "Free parking", "TV"],
    featured: true,
    geometry: { type: "Point", coordinates: [72.8258, 19.0596] },
    hostIndex: 0
  },
  {
    title: "Alibaug Private Coconut Grove Pool Villa",
    description: "Nestled amidst a 2-acre private coconut plantation in Awas Alibaug, this tropical Balinese villa features an open courtyard, a 40-foot private swimming pool, outdoor rain showers, and dedicated in-house chef service preparing Konkani coastal cuisine.",
    images: [
      { url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80", filename: "alibaug_1" },
      { url: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1200&q=80", filename: "alibaug_2" }
    ],
    price: 18000,
    location: "Awas, Alibaug",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Villa",
    maxGuests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 4,
    amenities: ["Wifi", "Pool", "Air conditioning", "Kitchen", "Free parking", "Private patio", "Chef on call"],
    featured: true,
    geometry: { type: "Point", coordinates: [72.8596, 18.7844] },
    hostIndex: 0
  },
  {
    title: "Lonavala Mist Valley Cliff Villa",
    description: "Perched dramatically on the cliff edge facing the Tungarli valley, this glass-walled architectural villa enjoys cascading monsoon waterfalls and misty morning clouds. Features an infinity pool looking straight into the Sahyadri gorge.",
    images: [
      { url: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80", filename: "lonavala_1" },
      { url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80", filename: "lonavala_2" }
    ],
    price: 16500,
    location: "Tungarli, Lonavala",
    country: "India",
    category: "Mountains",
    propertyType: "Villa",
    maxGuests: 10,
    bedrooms: 4,
    beds: 5,
    bathrooms: 4,
    amenities: ["Wifi", "Pool", "Air conditioning", "Mountain view", "Balcony", "Free parking", "Barbecue"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.4072, 18.7557] },
    hostIndex: 0
  },
  {
    title: "Koregaon Park Bohemian Artist Studio",
    description: "Located in the greenest heart of Pune's Koregaon Park, surrounded by banyan trees and artisan cafes. High exposed brick ceilings, curated contemporary art, a sunlit reading nook, and an expansive plant-filled balcony.",
    images: [
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80", filename: "pune_1" },
      { url: "https://images.unsplash.com/photo-1502005229762-ae1b46000e48?auto=format&fit=crop&w=1200&q=80", filename: "pune_2" }
    ],
    price: 3600,
    location: "Koregaon Park, Pune",
    country: "India",
    category: "Rooms",
    propertyType: "Studio",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Kitchen", "Dedicated workspace", "Balcony", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.8938, 18.5362] },
    hostIndex: 0
  },
  {
    title: "Mahabaleshwar Strawberry Hill Cottage",
    description: "Quaint stone cottage enveloped by strawberry fields and pine woods. Enjoy morning mist, freshly plucked farm berries, a crackling outdoor bonfire under starlit skies, and breathtaking views of the Krishna river valley.",
    images: [
      { url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80", filename: "maha_1" }
    ],
    price: 5200,
    location: "Panchgani Road, Mahabaleshwar",
    country: "India",
    category: "Farms",
    propertyType: "Cottage",
    maxGuests: 5,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Free parking", "Kitchen", "Indoor fireplace", "Garden view"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.6607, 17.9237] },
    hostIndex: 0
  },
  {
    title: "Juhu Beachside Designer Suite",
    description: "Steps from Juhu Beach with sea breezes and tranquil coastal vibes. Chic modern aesthetics with designer furnishings, smart home automation, and proximity to Mumbai's finest dining and entertainment hubs.",
    images: [
      { url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80", filename: "juhu_1" }
    ],
    price: 8900,
    location: "Juhu, Mumbai",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 3,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Kitchen", "Sea view", "Elevator", "Dedicated workspace"],
    featured: false,
    geometry: { type: "Point", coordinates: [72.8267, 19.0988] },
    hostIndex: 0
  },
  {
    title: "Igatpuri Mountain Vineyard Haven",
    description: "Contemporary glass-wrapped villa overlooking rolling Nashik grape vineyards and the misty peaks of Kalsubai. Features a private wine-tasting patio, plunge pool, and expansive terrace for sunset stargazing.",
    images: [
      { url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80", filename: "igatpuri_1" }
    ],
    price: 11200,
    location: "Igatpuri, Nashik",
    country: "India",
    category: "Farms",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Pool", "Air conditioning", "Kitchen", "Free parking", "Mountain view", "Barbecue"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.5683, 19.6974] },
    hostIndex: 0
  },
  {
    title: "Matheran Colonial Heritage Bungalow",
    description: "Step back into the 1920s in this eco-sensitive, vehicle-free hill station retreat. Teakwood four-poster beds, wide wraparound verandahs, dense forest trails right at your doorstep, and zero urban noise.",
    images: [
      { url: "https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=1200&q=80", filename: "matheran_1" }
    ],
    price: 6400,
    location: "Charlotte Lake, Matheran",
    country: "India",
    category: "Trending",
    propertyType: "Cottage",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 2,
    amenities: ["Garden view", "Free breakfast", "Outdoor dining", "Fireplace", "Board games"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.2713, 18.9865] },
    hostIndex: 0
  },
  {
    title: "Colaba Heritage Art Deco Loft",
    description: "High 14-foot ceilings, vintage Burma teak rafters, and hand-painted encaustic tiles in South Mumbai's historic heritage precinct. Walkable distance to the Gateway of India, art galleries, and iconic seaside cafes.",
    images: [
      { url: "https://images.unsplash.com/photo-1502005229762-ae1b46000e48?auto=format&fit=crop&w=1200&q=80", filename: "colaba_1" }
    ],
    price: 7800,
    location: "Colaba, Mumbai",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Kitchen", "Dedicated workspace", "Washer", "Elevator"],
    featured: false,
    geometry: { type: "Point", coordinates: [72.8311, 18.9220] },
    hostIndex: 0
  },
  {
    title: "Mulshi Eco Lakefront Wooden Chalet",
    description: "Built entirely with sustainable treated pine wood overlooking the tranquil waters of Mulshi Dam. Floor-to-ceiling glass reveals misty lake sunrises, with kayaks and nature walking trails at your disposal.",
    images: [
      { url: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1200&q=80", filename: "mulshi_1" }
    ],
    price: 9500,
    location: "Mulshi, Pune",
    country: "India",
    category: "Mountains",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Lake view", "Free parking", "Kitchenette", "Barbecue", "Balcony"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.5134, 18.5089] },
    hostIndex: 0
  },

  // 11-20: Goa Coastal & Heritage
  {
    title: "Candolim Portuguese Heritage Pool Villa",
    description: "Restored 150-year-old Indo-Portuguese estate boasting mother-of-pearl oyster shell windows, antique four-poster beds, a private swimming pool fringed by frangipani blossoms, and a lush tropical garden.",
    images: [
      { url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1200&q=80", filename: "candolim_1" },
      { url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80", filename: "candolim_2" }
    ],
    price: 15500,
    location: "Candolim, North Goa",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Villa",
    maxGuests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 4,
    amenities: ["Wifi", "Pool", "Air conditioning", "Kitchen", "Free parking", "Private patio", "Chef on call"],
    featured: true,
    geometry: { type: "Point", coordinates: [73.7667, 15.5173] },
    hostIndex: 1
  },
  {
    title: "Assagao Bohemian Courtyard Villa",
    description: "In Goa's chic culinary village of Assagao, this peaceful sunlit villa is sheltered under mango groves. Features terracotta courtyards, an azure plunge pool, open-air bath garden, and artisanal handmade decor.",
    images: [
      { url: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1200&q=80", filename: "assagao_1" }
    ],
    price: 13500,
    location: "Assagao, North Goa",
    country: "India",
    category: "Trending",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Pool", "Air conditioning", "Kitchen", "Free parking", "Balcony", "Dedicated workspace"],
    featured: true,
    geometry: { type: "Point", coordinates: [73.7825, 15.5925] },
    hostIndex: 1
  },
  {
    title: "Morjim Beach Sunset Eco Shack",
    description: "Steps away from the golden sands of Olive Ridley turtle beach in Morjim. Rustic eco-luxury wooden cottages with open sea view decks, gentle waves lulling you to sleep, and fresh organic seaside breakfast.",
    images: [
      { url: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=80", filename: "morjim_1" }
    ],
    price: 4900,
    location: "Morjim Beach, Goa",
    country: "India",
    category: "Rooms",
    propertyType: "Cottage",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Sea view", "Beach access", "Free breakfast", "Balcony"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.7346, 15.6171] },
    hostIndex: 1
  },
  {
    title: "Anjuna Cliffside Ocean Panorama Suite",
    description: "Perched high on the Anjuna cliffs overlooking the crashing Arabian Sea waves. Watch world-famous psychedelic sunsets from your private plunge jacuzzi while listening to ambient seaside music.",
    images: [
      { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80", filename: "anjuna_1" }
    ],
    price: 7200,
    location: "Anjuna, Goa",
    country: "India",
    category: "Trending",
    propertyType: "Apartment",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Sea view", "Balcony", "Free parking", "Hot tub"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.7431, 15.5808] },
    hostIndex: 1
  },
  {
    title: "Palolem Crescent Bay Beach Wooden Chalet",
    description: "Nestled in South Goa's picturesque crescent bay under towering coconut palms. Gentle calm turquoise waters, warm white sand, dolphins spotted off the coast, and beachfront candlelit seafood dinners.",
    images: [
      { url: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=80", filename: "palolem_1" }
    ],
    price: 4200,
    location: "Palolem Beach, South Goa",
    country: "India",
    category: "Rooms",
    propertyType: "Cottage",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Sea view", "Beach access", "Air conditioning", "Balcony", "Restaurant on site"],
    featured: false,
    geometry: { type: "Point", coordinates: [74.0232, 15.0100] },
    hostIndex: 1
  },
  {
    title: "Fontainhas Latin Quarter Pastel House",
    description: "Located within the UNESCO heritage precinct of Fontainhas in Panaji. Bright yellow Portuguese colonial townhouse with ornate wrought-iron balconies, azulejos tiles, and historic cobblestone lanes.",
    images: [
      { url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80", filename: "fontainhas_1" }
    ],
    price: 5800,
    location: "Fontainhas, Panaji, Goa",
    country: "India",
    category: "Iconic Cities",
    propertyType: "House",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Kitchen", "Dedicated workspace", "Balcony"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.8315, 15.4989] },
    hostIndex: 1
  },
  {
    title: "Vagator Hilltop Villa with Private Lap Pool",
    description: "Modern minimalist masterpiece situated on Vagator hill. Featuring double-height glass walls, 50-foot private lap pool, sundecks, and proximity to Goa's buzzing open-air electronic clubs.",
    images: [
      { url: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80", filename: "vagator_1" }
    ],
    price: 19500,
    location: "Vagator, Goa",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Villa",
    maxGuests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 4,
    amenities: ["Wifi", "Pool", "Air conditioning", "Kitchen", "Free parking", "Sea view", "Barbecue"],
    featured: true,
    geometry: { type: "Point", coordinates: [73.7420, 15.6028] },
    hostIndex: 1
  },
  {
    title: "Benaulim Serene Rice Field Farmhouse",
    description: "Peaceful escape amidst lush emerald paddy fields in South Goa. Wake up to singing kingfishers, cycle along quiet country lanes to Benaulim beach, and savor traditional Goan fish curry.",
    images: [
      { url: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80", filename: "benaulim_1" }
    ],
    price: 4500,
    location: "Benaulim, South Goa",
    country: "India",
    category: "Farms",
    propertyType: "House",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Kitchen", "Free parking", "Air conditioning", "Garden view", "Bicycles provided"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.9312, 15.2530] },
    hostIndex: 1
  },
  {
    title: "Chapora Riverfront Houseboat",
    description: "Sail gently down the calm backwaters of the Chapora river. Traditional wooden crafted houseboat featuring luxurious air-conditioned staterooms, sun loungers on upper deck, and fresh catch cooked onboard.",
    images: [
      { url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80", filename: "chapora_1" }
    ],
    price: 11000,
    location: "Chapora River, Siolim, Goa",
    country: "India",
    category: "Boats",
    propertyType: "Boat",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Air conditioning", "Water view", "Meals included", "Sun deck", "Fishing gear"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.7661, 15.6264] },
    hostIndex: 1
  },
  {
    title: "Arambol Bohemian Beachside Treehouse",
    description: "Handcrafted bamboo and teak treehouse suspended above the sand dunes near Arambol sweet water lake. Open-air balcony with hammock, panoramic ocean sunsets, and vibrant drum circle culture.",
    images: [
      { url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80", filename: "arambol_1" }
    ],
    price: 3200,
    location: "Arambol Beach, Goa",
    country: "India",
    category: "Rooms",
    propertyType: "Cabin",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Sea view", "Balcony", "Beach access", "Hammock"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.7042, 15.6869] },
    hostIndex: 1
  },

  // 21-30: Himachal Pradesh & Mountains
  {
    title: "The Himalayan Cedar Cabin Old Manali",
    description: "Handcrafted from reclaimed Himalayan deodar wood and river stones, this cozy mountain retreat sits among ancient pine trees in Old Manali. Cozy up beside the stone wood-burning fireplace while gazing at snow-capped peaks across the Beas valley.",
    images: [
      { url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80", filename: "manali_1" },
      { url: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80", filename: "manali_2" }
    ],
    price: 5200,
    location: "Old Manali, Manali",
    country: "India",
    category: "Mountains",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Indoor fireplace", "Mountain view", "Free parking", "Balcony", "Kitchen"],
    featured: true,
    geometry: { type: "Point", coordinates: [77.1887, 32.2530] },
    hostIndex: 2
  },
  {
    title: "Solang Snow Valley Alpine Chalet",
    description: "Front-row seats to snow-covered peaks in Solang Valley. Scandinavian timber architecture, heated wooden flooring, expansive glass facade facing Rohtang pass, and direct access to ski slopes.",
    images: [
      { url: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80", filename: "solang_1" }
    ],
    price: 8800,
    location: "Solang Valley, Manali",
    country: "India",
    category: "Arctic",
    propertyType: "Cabin",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Indoor fireplace", "Mountain view", "Heating", "Free parking", "Ski storage"],
    featured: true,
    geometry: { type: "Point", coordinates: [77.1583, 32.3167] },
    hostIndex: 2
  },
  {
    title: "Shimla Mall Road British Era Heritage Cottage",
    description: "Constructed during the British Raj in 1912, this colonial stone manor sits among rhododendron trees along the quiet upper ridge above Shimla Mall Road. Features antique fireplaces and panoramic valley views.",
    images: [
      { url: "https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=1200&q=80", filename: "shimla_1" }
    ],
    price: 7400,
    location: "Mall Road, Shimla",
    country: "India",
    category: "Castles",
    propertyType: "Cottage",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Heating", "Mountain view", "Fireplace", "Breakfast included", "Balcony"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.1734, 31.1048] },
    hostIndex: 2
  },
  {
    title: "Spiti Valley Stargazing Mud Dome",
    description: "Experience the remote Trans-Himalayan wonderland of Kaza, Spiti Valley at 12,000 feet. Traditional sun-dried adobe mud construction with skylight dome for jaw-dropping views of the Milky Way galaxy.",
    images: [
      { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80", filename: "spiti_1" }
    ],
    price: 3800,
    location: "Kaza, Spiti Valley",
    country: "India",
    category: "Domes",
    propertyType: "Other",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Mountain view", "Heated blankets", "Traditional home food", "Stargazing deck"],
    featured: true,
    geometry: { type: "Point", coordinates: [78.0416, 32.2276] },
    hostIndex: 2
  },
  {
    title: "Dharamkot Pine Woods Monastery Haven",
    description: "Perched above McLeod Ganj in Upper Dharamshala facing the towering Dhauladhar snow crests. Quiet meditation garden, Tibetan rugs, organic cedar tea station, and trekking trails to Triund at your doorstep.",
    images: [
      { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80", filename: "dharamkot_1" }
    ],
    price: 3400,
    location: "Dharamkot, Dharamshala",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Mountain view", "Balcony", "Kitchenette", "Dedicated workspace"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.3263, 32.2472] },
    hostIndex: 2
  },
  {
    title: "Kasol Parvati River Wooden Haven",
    description: "Built along the bubbling turquoise waters of the Parvati river. Surrounded by towering pine forests and alpine meadows, this rustic cedarwood lodge offers evening riverside bonfires and fresh trout.",
    images: [
      { url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80", filename: "kasol_1" }
    ],
    price: 2900,
    location: "Kasol, Parvati Valley",
    country: "India",
    category: "Camping",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: ["River view", "Free parking", "Bonfire pit", "Outdoor seating", "Hiking trails"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.3150, 32.0100] },
    hostIndex: 2
  },
  {
    title: "Jibhi Pine Treehouse by the Tirthan Stream",
    description: "Suspended 30 feet in the air amidst majestic cedar and pine trees in Jibhi. Listen to the roaring Himalayan stream beneath you, relax on the cantilevered balcony, and explore nearby Serolsar Lake.",
    images: [
      { url: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80", filename: "jibhi_1" }
    ],
    price: 4600,
    location: "Jibhi, Banjar Valley",
    country: "India",
    category: "Trending",
    propertyType: "Cabin",
    maxGuests: 3,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Mountain view", "Balcony", "Fireplace", "Free breakfast"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.3500, 31.6360] },
    hostIndex: 2
  },
  {
    title: "Kasauli Sunset Vista British Cottage",
    description: "Charming stone cottage perched on Garkhal ridge with panoramic views of the Punjab plains below. Watch golden sunsets from the flower garden, enjoy vintage wooden furnishings, and explore Gilbert Trail.",
    images: [
      { url: "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=1200&q=80", filename: "kasauli_1" }
    ],
    price: 6100,
    location: "Upper Mall, Kasauli",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Heating", "Garden view", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.9649, 30.9013] },
    hostIndex: 2
  },
  {
    title: "Bir Billing Paragliding Valley View Chalet",
    description: "Overlook the world-famous paragliding landing site in Bir. Watch colorful gliders soar across the blue skies against the backdrop of snow-capped mountains while sipping local Kangra organic green tea.",
    images: [
      { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80", filename: "bir_1" }
    ],
    price: 3600,
    location: "Bir Colony, Kangra",
    country: "India",
    category: "Mountains",
    propertyType: "Apartment",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Mountain view", "Balcony", "Free parking", "Kitchenette"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.7167, 32.0500] },
    hostIndex: 2
  },
  {
    title: "Mashobra Apple Orchard Forest Villa",
    description: "Surrounded by a thriving private apple orchard in Mashobra near Shimla. Features wide wooden sundecks, glass dining conservatory, cedar-scented bedrooms, and direct access to Craignano nature park.",
    images: [
      { url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80", filename: "mashobra_1" }
    ],
    price: 8200,
    location: "Mashobra, Shimla",
    country: "India",
    category: "Farms",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Mountain view", "Indoor fireplace", "Garden view", "Free parking", "Kitchen"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.2372, 31.1308] },
    hostIndex: 2
  },

  // 31-40: Rajasthan Royal Heritage & Desert
  {
    title: "Jaipur Pink City Heritage Courtyard Haveli",
    description: "Step into royal Rajputana splendor within Jaipur's walled city. Hand-painted frescoes, intricately carved sandstone jharokhas, central fountain courtyard, antique silver furniture, and rooftop sunset view of Nahargarh Fort.",
    images: [
      { url: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80", filename: "jaipur_1" },
      { url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80", filename: "jaipur_2" }
    ],
    price: 9200,
    location: "Pink City, Jaipur",
    country: "India",
    category: "Castles",
    propertyType: "Haveli",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Air conditioning", "Breakfast included", "Courtyard", "Free parking", "Terrace view"],
    featured: true,
    geometry: { type: "Point", coordinates: [75.8267, 26.9239] },
    hostIndex: 3
  },
  {
    title: "Udaipur Lake Pichola Royal Water Palace Suite",
    description: "Unparalleled front-row panoramas of the shimmering Lake Pichola, Jag Mandir, and City Palace. Savor private candlelit dinners on your lake-jutting marble jharokha while watching illuminated palace reflections.",
    images: [
      { url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80", filename: "udaipur_1" },
      { url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80", filename: "udaipur_2" }
    ],
    price: 16500,
    location: "Lake Pichola, Udaipur",
    country: "India",
    category: "Trending",
    propertyType: "Haveli",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Water view", "Breakfast included", "Balcony", "Room service"],
    featured: true,
    geometry: { type: "Point", coordinates: [73.6835, 24.5760] },
    hostIndex: 3
  },
  {
    title: "Jaisalmer Sam Sand Dunes Royal Glamping Camp",
    description: "Experience the magic of the Thar Desert beneath a billion brilliant stars. Luxury Swiss tents with attached modern stone bathrooms, camel safaris over sweeping dunes, traditional Kalbeliya folk dance, and campfire feasts.",
    images: [
      { url: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1200&q=80", filename: "jaisalmer_1" }
    ],
    price: 6800,
    location: "Sam Sand Dunes, Jaisalmer",
    country: "India",
    category: "Camping",
    propertyType: "Other",
    maxGuests: 4,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Dinner included", "Breakfast included", "Camel safari", "Campfire", "Cultural show"],
    featured: true,
    geometry: { type: "Point", coordinates: [70.5283, 26.8286] },
    hostIndex: 3
  },
  {
    title: "Jodhpur Blue City Brahmin Rooftop Haveli",
    description: "Located deep in the historic maze of indigo-blue streets beneath Mehrangarh Fort. Hand-painted blue murals, vintage Rajasthani textiles, and a panoramic rooftop restaurant looking directly up at the soaring fort walls.",
    images: [
      { url: "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=1200&q=80", filename: "jodhpur_1" }
    ],
    price: 4200,
    location: "Navchokiya, Jodhpur",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Haveli",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Fort view", "Rooftop access", "Breakfast included"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.0188, 26.2978] },
    hostIndex: 3
  },
  {
    title: "Pushkar Sacred Lake Heritage Villa",
    description: "Peaceful desert haven overlooking the 52 holy ghats of Pushkar Lake. Watch tranquil morning aartis, explore colorful bazaar lanes, and unwind in lush garden courtyards blooming with bougainvillea.",
    images: [
      { url: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80", filename: "pushkar_1" }
    ],
    price: 3600,
    location: "Varaha Ghat, Pushkar",
    country: "India",
    category: "Rooms",
    propertyType: "Haveli",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Lake view", "Yoga deck", "Breakfast included"],
    featured: false,
    geometry: { type: "Point", coordinates: [74.5554, 26.4897] },
    hostIndex: 3
  },
  {
    title: "Ranthambore Royal Jungle Safari Lodge",
    description: "Nestled on the edge of Ranthambore Tiger Reserve surrounded by Aravalli hills. Private mud cottages, outdoor swimming pool under neem trees, guided morning safari jeeps, and naturalist lectures by the fire.",
    images: [
      { url: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=1200&q=80", filename: "ranthambore_1" }
    ],
    price: 11500,
    location: "Sawai Madhopur, Ranthambore",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Resort",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Pool", "Air conditioning", "All meals included", "Safari booking", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.3688, 25.9928] },
    hostIndex: 3
  },
  {
    title: "Kumbhalgarh Fortress View Heritage Villa",
    description: "Gaze at the Great Wall of India from your private terrace. This stone-clad fortress villa blends seamlessly into the rugged Aravalli landscape, offering tranquil infinity pool views of the Mewar citadel.",
    images: [
      { url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1200&q=80", filename: "kumbhalgarh_1" }
    ],
    price: 8400,
    location: "Kumbhalgarh, Rajsamand",
    country: "India",
    category: "Castles",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Pool", "Air conditioning", "Mountain view", "Free parking", "Restaurant"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.5872, 25.1478] },
    hostIndex: 3
  },
  {
    title: "Bikaner Junagarh Regal Courtyard",
    description: "Red sandstone palatial residence situated near the imposing Junagarh Fort. Features ornate jali carvings, antique Belgian chandeliers, regal courtyards, and delicious traditional Bikaneri culinary spreads.",
    images: [
      { url: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80", filename: "bikaner_1" }
    ],
    price: 5200,
    location: "Junagarh Road, Bikaner",
    country: "India",
    category: "Castles",
    propertyType: "Haveli",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Free parking", "Courtyard", "Breakfast included"],
    featured: false,
    geometry: { type: "Point", coordinates: [73.3119, 28.0229] },
    hostIndex: 3
  },
  {
    title: "Alwar Neemrana Hillside Fort Villa",
    description: "Built along the historic ridge below Neemrana Fort Palace. Enjoy terraced hanging gardens, stepwell tours, zip-lining across Aravalli gorges, and peaceful heritage rooms with antique four-poster beds.",
    images: [
      { url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80", filename: "neemrana_1" }
    ],
    price: 7800,
    location: "Neemrana, Alwar",
    country: "India",
    category: "Castles",
    propertyType: "Villa",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Pool", "Fort view", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.3860, 27.9900] },
    hostIndex: 3
  },
  {
    title: "Shekhawati Open Air Fresco Mansion",
    description: "A living museum in Mandawa, Shekhawati. Walk through courtyards covered in 19th-century mythological wall frescoes, enjoy camel cart village rides, and stay in authentic heritage rooms.",
    images: [
      { url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80", filename: "mandawa_1" }
    ],
    price: 4300,
    location: "Mandawa, Shekhawati",
    country: "India",
    category: "Castles",
    propertyType: "Haveli",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Heritage tour", "Breakfast included", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [75.1432, 28.0558] },
    hostIndex: 3
  },

  // 41-50: Kerala & Backwaters
  {
    title: "Alleppey Luxury Royal Backwaters Houseboat",
    description: "Cruise down Kerala's serene Vembanad lake and narrow palm-canopied canals. Crafted from natural anjili wood and coir, this luxury Kettuvallam offers air-conditioned bedrooms, private chef preparing Karimeen pollichathu, and upper sun deck.",
    images: [
      { url: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80", filename: "alleppey_1" },
      { url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80", filename: "alleppey_2" }
    ],
    price: 13500,
    location: "Punnamada Lake, Alleppey",
    country: "India",
    category: "Boats",
    propertyType: "Boat",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Air conditioning", "All meals included", "Water view", "Private chef", "Sunset cruise"],
    featured: true,
    geometry: { type: "Point", coordinates: [76.3533, 9.5167] },
    hostIndex: 4
  },
  {
    title: "Munnar Tea Estate Colonial Planter's Bungalow",
    description: "Perched 6,000 feet above sea level amidst thousands of acres of emerald green tea plantations. Sip freshly brewed artisanal single-estate tea while rolling monsoon mist glides past your Victorian bay windows.",
    images: [
      { url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80", filename: "munnar_1" }
    ],
    price: 8900,
    location: "Chithirapuram, Munnar",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Mountain view", "Fireplace", "Tea plantation walk", "Breakfast included", "Free parking"],
    featured: true,
    geometry: { type: "Point", coordinates: [77.0595, 10.0889] },
    hostIndex: 4
  },
  {
    title: "Wayanad Rainforest Spice Plantation Treehouse",
    description: "Suspended 60 feet high in the rainforest canopy above a 50-acre cardamom, clove, and pepper estate. Wake up to the calls of Malabar giant squirrels and enjoy mist-covered Western Ghats panoramas.",
    images: [
      { url: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80", filename: "wayanad_1" }
    ],
    price: 6500,
    location: "Vythiri, Wayanad",
    country: "India",
    category: "Farms",
    propertyType: "Cabin",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Mountain view", "Breakfast included", "Spice plantation tour", "Balcony", "Free parking"],
    featured: true,
    geometry: { type: "Point", coordinates: [76.0360, 11.5370] },
    hostIndex: 4
  },
  {
    title: "Fort Kochi Dutch Heritage Art Villa",
    description: "A 200-year-old Dutch-Portuguese colonial manor in historic Fort Kochi. Walk to the Chinese fishing nets, antique spice markets, and art cafes. Terracotta tiled roofs, high ceilings, and lush courtyard pool.",
    images: [
      { url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1200&q=80", filename: "kochi_1" }
    ],
    price: 7600,
    location: "Princess Street, Fort Kochi",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Villa",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Pool", "Air conditioning", "Kitchen", "Free parking", "Courtyard"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.2429, 9.9658] },
    hostIndex: 4
  },
  {
    title: "Varkala Cliff Edge Ocean Horizon Studio",
    description: "Direct cliff-top location overlooking the dramatic red laterite cliffs and turquoise Arabian Sea in Varkala. Walk straight down to the beach, take daily seaside yoga classes, and enjoy fresh fruit smoothie bowls.",
    images: [
      { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80", filename: "varkala_1" }
    ],
    price: 4100,
    location: "North Cliff, Varkala",
    country: "India",
    category: "Rooms",
    propertyType: "Studio",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Sea view", "Balcony", "Beach access", "Yoga deck"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.7063, 8.7379] },
    hostIndex: 4
  },
  {
    title: "Kumarakom Vembanad Lake Infinity Villa",
    description: "Nestled along the shores of Vembanad Lake in Kumarakom bird sanctuary. Watch migratory herons from your private pool deck, take canoe rides through village lotus canals, and experience authentic Ayurvedic massages.",
    images: [
      { url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80", filename: "kumarakom_1" }
    ],
    price: 14200,
    location: "Kumarakom, Kottayam",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Pool", "Air conditioning", "Lake view", "Ayurvedic spa", "Chef on call"],
    featured: true,
    geometry: { type: "Point", coordinates: [76.4300, 9.6176] },
    hostIndex: 4
  },
  {
    title: "Thekkady Cardamom Hills Wooden Lodge",
    description: "Located near Periyar Tiger Reserve. Built with aromatic cedar and wild stone amidst cardamom groves. Spot wild elephants from lake boats and enjoy authentic Kerala culinary cooking classes.",
    images: [
      { url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80", filename: "thekkady_1" }
    ],
    price: 5400,
    location: "Kumily, Thekkady",
    country: "India",
    category: "Farms",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Garden view", "Free parking", "Breakfast included"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.1667, 9.6000] },
    hostIndex: 4
  },
  {
    title: "Kovalam Lighthouse Beachfront Penthouse",
    description: "Directly facing Kovalam's iconic red-and-white striped lighthouse and crescent beach. Huge private sun terrace, soothing sounds of rolling breakers, and fresh grilled lobster dinners at sunset.",
    images: [
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80", filename: "kovalam_1" }
    ],
    price: 6800,
    location: "Lighthouse Beach, Kovalam",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Sea view", "Balcony", "Beach access", "Kitchen"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.9786, 8.3988] },
    hostIndex: 4
  },
  {
    title: "Athirappilly Rainforest Waterfall Villa",
    description: "Overlook the magnificent 80-foot roaring Athirappilly waterfalls, the Niagara of India. Surrounded by dense Sholayar rainforest where hornbills fly past your infinity pool deck.",
    images: [
      { url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80", filename: "athirappilly_1" }
    ],
    price: 12800,
    location: "Athirappilly, Thrissur",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Pool", "Air conditioning", "Waterfall view", "Free parking", "Restaurant"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.5367, 10.2933] },
    hostIndex: 4
  },
  {
    title: "Bekal Beachfront Coral Sanctuary Cottage",
    description: "Tranquil coastal haven right beside the historic 17th-century Bekal Fort. Golden beaches, backwater estuaries, private hammocks beneath swaying coconut groves, and fresh toddy and coconut water.",
    images: [
      { url: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=80", filename: "bekal_1" }
    ],
    price: 5900,
    location: "Bekal Fort Beach, Kasaragod",
    country: "India",
    category: "Rooms",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Beach access", "Sea view", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [75.0319, 12.3928] },
    hostIndex: 4
  },

  // 51-60: Karnataka & Western Ghats
  {
    title: "Coorg Coffee Plantation Wooden Heritage Estate",
    description: "Nestled within an active 80-acre Robusta coffee, cardamom, and pepper estate in Madikeri. Wake up to the rich aroma of roasting coffee, take guided plantation walks, and enjoy home-cooked Pandi curry.",
    images: [
      { url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80", filename: "coorg_1" },
      { url: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80", filename: "coorg_2" }
    ],
    price: 6800,
    location: "Madikeri, Coorg",
    country: "India",
    category: "Farms",
    propertyType: "Cottage",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Mountain view", "Coffee tour", "Breakfast included", "Free parking", "Indoor fireplace"],
    featured: true,
    geometry: { type: "Point", coordinates: [75.7382, 12.4244] },
    hostIndex: 5
  },
  {
    title: "Bengaluru Indiranagar Designer Garden Loft",
    description: "In Bengaluru's premier dining and cultural neighborhood of Indiranagar. Soaring ceilings, private leafy rooftop garden, high-speed fiber internet, espresso bar, and artisan breweries a short walk away.",
    images: [
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80", filename: "bangalore_1" }
    ],
    price: 4800,
    location: "Indiranagar, Bengaluru",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 3,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Kitchen", "Dedicated workspace", "Balcony", "Elevator"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.6412, 12.9784] },
    hostIndex: 5
  },
  {
    title: "Gokarna Om Beach Cliffside Sunset Shack",
    description: "Perched right above the iconic spiritual Om Beach in Gokarna. Enjoy untamed Arabian Sea vistas, beach trekking trails to Half Moon Beach, fresh seafood shacks, and tranquil temple bells in the distance.",
    images: [
      { url: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=80", filename: "gokarna_1" }
    ],
    price: 3100,
    location: "Om Beach, Gokarna",
    country: "India",
    category: "Rooms",
    propertyType: "Cabin",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Sea view", "Beach access", "Balcony", "Free parking", "Cafe on site"],
    featured: true,
    geometry: { type: "Point", coordinates: [74.3167, 14.5167] },
    hostIndex: 5
  },
  {
    title: "Chikmagalur Mullayanagiri Peak Hilltop Chalet",
    description: "Set high up on the slopes of Karnataka's highest peak Mullayanagiri. Marvel at 360-degree clouds rolling beneath your wooden sundeck, sip fresh Arabica estate coffee, and trek into Baba Budangiri hills.",
    images: [
      { url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80", filename: "chikmagalur_1" }
    ],
    price: 7200,
    location: "Mullayanagiri, Chikmagalur",
    country: "India",
    category: "Mountains",
    propertyType: "Cabin",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Coffee included", "Fireplace", "Free parking", "Balcony"],
    featured: false,
    geometry: { type: "Point", coordinates: [75.7194, 13.3917] },
    hostIndex: 5
  },
  {
    title: "Hampi Boulder Valley UNESCO Heritage Cottage",
    description: "Located among the surreal prehistoric boulder fields across the Tungabhadra river from Hampi's Vijayanagara temple ruins. Rent mopeds to explore Virupaksha temple and enjoy sunset music at Sanapur Lake.",
    images: [
      { url: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80", filename: "hampi_1" }
    ],
    price: 2800,
    location: "Sanapur, Hampi",
    country: "India",
    category: "Trending",
    propertyType: "Cottage",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Garden view", "Bicycle rental", "Restaurant", "Balcony"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.4600, 15.3350] },
    hostIndex: 5
  },
  {
    title: "Mysore Royal Wodeyar Heritage Suite",
    description: "Located within walking distance of the illuminated Mysore Palace and Devaraja flower market. Rosewood carved furniture, Mysore silk furnishings, private courtyard, and traditional South Indian filter coffee.",
    images: [
      { url: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80", filename: "mysore_1" }
    ],
    price: 4400,
    location: "Nazarbad, Mysore",
    country: "India",
    category: "Castles",
    propertyType: "Haveli",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Palace view", "Breakfast included", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.6552, 12.3052] },
    hostIndex: 5
  },
  {
    title: "Sakleshpur Rainforest Stream Wood Cabin",
    description: "Hidden in the deep Western Ghats rainforest with a crystal-clear mountain stream flowing right outside your porch. Plunge into natural rock pools, listen to cicadas, and enjoy traditional Malnad cuisine.",
    images: [
      { url: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1200&q=80", filename: "sakleshpur_1" }
    ],
    price: 5100,
    location: "Sakleshpur, Hassan",
    country: "India",
    category: "Mountains",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Mountain view", "Stream access", "Home-cooked meals", "Bonfire", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [75.7865, 12.9436] },
    hostIndex: 5
  },
  {
    title: "Kabini Jungle Safari Lakefront Lodge",
    description: "Located along the backwaters of Kabini river, renowned as India's best spot for black panthers, leopards, and herds of wild Asian elephants. Features infinity lake pool and open-top 4x4 safaris.",
    images: [
      { url: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=1200&q=80", filename: "kabini_1" }
    ],
    price: 15800,
    location: "Nagarhole, Kabini",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Resort",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Pool", "All meals included", "Lake view", "Safari bookings", "Air conditioning"],
    featured: true,
    geometry: { type: "Point", coordinates: [76.2711, 11.9261] },
    hostIndex: 5
  },
  {
    title: "Dandeli River Kali Jungle Treehouse",
    description: "High above the Kali river rapids in Dandeli wildlife sanctuary. Experience white-water rafting, natural jacuzzis, hornbill birdwatching, and evening jungle barbecues under starry skies.",
    images: [
      { url: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80", filename: "dandeli_1" }
    ],
    price: 4900,
    location: "Kali River, Dandeli",
    country: "India",
    category: "Camping",
    propertyType: "Cabin",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["River view", "Rafting gear", "Meals included", "Campfire", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [74.6231, 15.2361] },
    hostIndex: 5
  },
  {
    title: "Udupi Malpe Beach Coconut Grove Cottage",
    description: "Steps from Malpe beach and St. Mary's volcanic basalt rock islands. Savor world-famous authentic Udupi dosas, fresh coastal seafood, gentle sea breezes, and private hammocks under coconut palms.",
    images: [
      { url: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=80", filename: "udupi_1" }
    ],
    price: 3900,
    location: "Malpe Beach, Udupi",
    country: "India",
    category: "Rooms",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Beach access", "Sea view", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [74.7042, 13.3516] },
    hostIndex: 5
  },

  // 61-70: Uttarakhand & Himalayas
  {
    title: "Rishikesh Holy Ganga Riverfront Yoga Sanctuary",
    description: "Perched directly above the sacred emerald waters of the Ganges near Tapovan. Private wooden yoga meditation deck, gentle sound of the river rapids, views of the forested Himalayan foothills, and evening Ganga aarti.",
    images: [
      { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80", filename: "rishikesh_1" },
      { url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80", filename: "rishikesh_2" }
    ],
    price: 4900,
    location: "Tapovan, Rishikesh",
    country: "India",
    category: "Trending",
    propertyType: "Apartment",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "River view", "Yoga deck", "Balcony", "Air conditioning", "Kitchen"],
    featured: true,
    geometry: { type: "Point", coordinates: [78.3247, 30.1317] },
    hostIndex: 6
  },
  {
    title: "Mussoorie Cloud's End Himalayan Heritage Lodge",
    description: "Surrounded by thick oak and deodar forests at the western edge of Mussoorie. Watch the famous Mussoorie winter line sunset, warm up by stone fireplaces, and gaze at the white peaks of Bunderpoonch.",
    images: [
      { url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80", filename: "mussoorie_1" }
    ],
    price: 6900,
    location: "Cloud's End, Mussoorie",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Fireplace", "Heating", "Free parking", "Forest trails"],
    featured: false,
    geometry: { type: "Point", coordinates: [78.0267, 30.4598] },
    hostIndex: 6
  },
  {
    title: "Auli Snow Peak Alpine Ski Chalet",
    description: "Front-row seats to India's finest ski slopes and the majestic 23,000-foot Nanda Devi peak. Wooden alpine architecture, floor heating, direct chairlift access, and steaming hot chocolate by the hearth.",
    images: [
      { url: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80", filename: "auli_1" }
    ],
    price: 9800,
    location: "Auli, Chamoli",
    country: "India",
    category: "Arctic",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Heating", "Ski storage", "Fireplace", "Free breakfast"],
    featured: true,
    geometry: { type: "Point", coordinates: [79.5700, 30.5300] },
    hostIndex: 6
  },
  {
    title: "Nainital Emerald Lakeview Stone Chalet",
    description: "Perched high on Ayarpatta hill with postcard views of the eye-shaped Naini Lake. Colonial stone construction, pine wood paneled ceilings, sunny garden terrace, and walk to Mallital boats.",
    images: [
      { url: "https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=1200&q=80", filename: "nainital_1" }
    ],
    price: 5800,
    location: "Ayarpatta, Nainital",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Lake view", "Heating", "Free parking", "Balcony", "Kitchen"],
    featured: false,
    geometry: { type: "Point", coordinates: [79.4591, 29.3803] },
    hostIndex: 6
  },
  {
    title: "Jim Corbett Wilderness Riverfront Safari Camp",
    description: "Bordering the Kosi river on the buffer zone of India's oldest national park. Stay in luxury stone-and-thatch cottages, fall asleep to the roar of tigers and barking deer, and take private 4x4 jungle safaris.",
    images: [
      { url: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=1200&q=80", filename: "corbett_1" }
    ],
    price: 10500,
    location: "Dhikala Zone, Jim Corbett",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Resort",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Pool", "All meals included", "River view", "Safari bookings", "Air conditioning"],
    featured: false,
    geometry: { type: "Point", coordinates: [78.9629, 29.5300] },
    hostIndex: 6
  },
  {
    title: "Kanatal Stargazing Geodesic Glamping Dome",
    description: "Futuristic transparent geodesic dome perched on an apple orchard cliff at 8,500 feet. Enjoy uninterrupted 180-degree views of snow-capped Garhwal peaks by day and billions of stars by night.",
    images: [
      { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80", filename: "kanatal_1" }
    ],
    price: 5200,
    location: "Kanatal, Tehri Garhwal",
    country: "India",
    category: "Domes",
    propertyType: "Other",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Mountain view", "Heated bed", "Stargazing deck", "Breakfast included", "Free parking"],
    featured: true,
    geometry: { type: "Point", coordinates: [78.3470, 30.4137] },
    hostIndex: 6
  },
  {
    title: "Ranikhet Himalayan Snow Range Orchard House",
    description: "Serene mountain villa surrounded by apricot, plum, and peach orchards in the cantonment town of Ranikhet. Direct panorama of Trishul, Nanda Devi, and Panchachuli Himalayan peaks.",
    images: [
      { url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80", filename: "ranikhet_1" }
    ],
    price: 4600,
    location: "Chaubattia, Ranikhet",
    country: "India",
    category: "Farms",
    propertyType: "House",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Fireplace", "Garden view", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [79.4322, 29.6434] },
    hostIndex: 6
  },
  {
    title: "Mukteshwar Glass House Valley Vista",
    description: "Floor-to-ceiling glass walls overlooking rolling valleys and dense oak forests in Mukteshwar. Spot colorful Himalayan monal birds while sitting beside your suspended indoor fireplace.",
    images: [
      { url: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80", filename: "mukteshwar_1" }
    ],
    price: 7400,
    location: "Mukteshwar, Nainital",
    country: "India",
    category: "Mountains",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Mountain view", "Indoor fireplace", "Kitchen", "Free parking", "Balcony"],
    featured: false,
    geometry: { type: "Point", coordinates: [79.6473, 29.4722] },
    hostIndex: 6
  },
  {
    title: "Chopta Tungnath Meadows Alpine Basecamp",
    description: "Known as the Mini Switzerland of India, situated at 9,000 feet. Wooden alpine huts surrounded by rhododendron blossoms, direct gateway to the highest Shiva temple Tungnath and Chandrashila peak.",
    images: [
      { url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80", filename: "chopta_1" }
    ],
    price: 3200,
    location: "Chopta, Rudraprayag",
    country: "India",
    category: "Camping",
    propertyType: "Cabin",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Mountain view", "Trek guidance", "Meals included", "Campfire", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [79.1793, 30.4853] },
    hostIndex: 6
  },
  {
    title: "Lansdowne Quiet Pine Oak Wood Cottage",
    description: "Escape to the peaceful cantonment hill station of Lansdowne. Built with stone and pine wood overlooking green valleys. Enjoy zero commercial clutter, pristine crisp air, and Bhulla Lake walks.",
    images: [
      { url: "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=1200&q=80", filename: "lansdowne_1" }
    ],
    price: 3900,
    location: "Lansdowne, Pauri Garhwal",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Mountain view", "Free parking", "Balcony", "Kitchen"],
    featured: false,
    geometry: { type: "Point", coordinates: [78.6853, 29.8377] },
    hostIndex: 6
  },

  // 71-80: Kashmir, Ladakh & Far North
  {
    title: "Srinagar Dal Lake Royal Carved Cedar Houseboat",
    description: "Moor amidst lotus blooms on Dal Lake in Srinagar. Intricately carved walnut wood interiors, antique Kashmiri carpets, private shikara taxi rides, and morning views of the snow-clad Zabarwan range.",
    images: [
      { url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80", filename: "srinagar_1" },
      { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80", filename: "srinagar_2" }
    ],
    price: 7800,
    location: "Dal Lake, Srinagar, Kashmir",
    country: "India",
    category: "Boats",
    propertyType: "Boat",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Water view", "Wazwan meals", "Heating", "Shikara ride included", "Free wifi"],
    featured: true,
    geometry: { type: "Point", coordinates: [74.8333, 34.0833] },
    hostIndex: 6
  },
  {
    title: "Gulmarg Gondola Snow Chalet",
    description: "Located within ski-in ski-out distance of the Apharwat peak gondola in Gulmarg. Cozy wooden timber chalet with Bukhari wood heater, steaming Kahwa tea, and fresh powder snow right at your door.",
    images: [
      { url: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80", filename: "gulmarg_1" }
    ],
    price: 11200,
    location: "Gulmarg, Baramulla, Kashmir",
    country: "India",
    category: "Arctic",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Heating", "Mountain view", "Ski storage", "Free breakfast", "Fireplace"],
    featured: true,
    geometry: { type: "Point", coordinates: [74.3800, 34.0500] },
    hostIndex: 6
  },
  {
    title: "Pahalgam Betaab Valley Pine Lodge",
    description: "Nestled along the rushing Lidder river in the scenic Betaab Valley. Gaze across meadows where wild horses graze, surrounded by pine-covered Himalayan slopes and glacier snows.",
    images: [
      { url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80", filename: "pahalgam_1" }
    ],
    price: 6400,
    location: "Betaab Valley, Pahalgam, Kashmir",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["River view", "Mountain view", "Heating", "Free parking", "Breakfast included"],
    featured: false,
    geometry: { type: "Point", coordinates: [75.3167, 34.0167] },
    hostIndex: 6
  },
  {
    title: "Leh Old City Stupa View Mud House",
    description: "Traditional Ladakhi sustainable adobe architecture with Shanti Stupa views in Leh. Poplar wood ceilings, traditional tandoor, sun-drenched rooftop terrace, and acclimatization-friendly oxygen comfort.",
    images: [
      { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80", filename: "leh_1" }
    ],
    price: 4500,
    location: "Changspa, Leh, Ladakh",
    country: "India",
    category: "Iconic Cities",
    propertyType: "House",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Mountain view", "Heating", "Rooftop deck", "Traditional Ladakhi food"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.5828, 34.1526] },
    hostIndex: 6
  },
  {
    title: "Nubra Valley Silk Route Sand Dunes Geodesic Camp",
    description: "Stay among the double-humped Bactrian camels in Hunder, Nubra Valley. High-altitude luxury geodesic domes with panoramic glass looking up at dramatic barren peaks and starry skies.",
    images: [
      { url: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1200&q=80", filename: "nubra_1" }
    ],
    price: 5800,
    location: "Hunder, Nubra Valley, Ladakh",
    country: "India",
    category: "Domes",
    propertyType: "Other",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Mountain view", "Heating", "All meals included", "Campfire", "Stargazing deck"],
    featured: true,
    geometry: { type: "Point", coordinates: [77.4667, 34.5833] },
    hostIndex: 6
  },
  {
    title: "Pangong Tso Blue Lake Glamping Pod",
    description: "Directly overlooking the surreal changing blue shades of Pangong Tso lake at 14,000 feet. Insulated weather-proof glamping pods with attached heated baths, offering world-class night astrophotography.",
    images: [
      { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80", filename: "pangong_1" }
    ],
    price: 7200,
    location: "Spangmik, Pangong Lake, Ladakh",
    country: "India",
    category: "Domes",
    propertyType: "Other",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Lake view", "Heated bed", "All meals included", "Astrophotography deck"],
    featured: false,
    geometry: { type: "Point", coordinates: [78.4500, 33.7500] },
    hostIndex: 6
  },
  {
    title: "Sonamarg Meadow of Gold Glacier Lodge",
    description: "Nestled along the Sindh river in Sonamarg, surrounded by the Thajiwas Glacier. Ride mountain ponies through blooming alpine pastures and relax in pine-scented luxury wood suites.",
    images: [
      { url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80", filename: "sonamarg_1" }
    ],
    price: 5600,
    location: "Thajiwas, Sonamarg, Kashmir",
    country: "India",
    category: "Mountains",
    propertyType: "Cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Glacier view", "River view", "Heating", "Free parking", "Meals available"],
    featured: false,
    geometry: { type: "Point", coordinates: [75.2950, 34.3050] },
    hostIndex: 6
  },
  {
    title: "Doodhpathri Valley of Milk Pine Cabin",
    description: "Untouched pristine meadow in Central Kashmir where the river looks like foaming white milk. Total peace, zero crowds, virgin pine forests, and shepherd sheep grazing across green hills.",
    images: [
      { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80", filename: "doodhpathri_1" }
    ],
    price: 4200,
    location: "Doodhpathri, Budgam, Kashmir",
    country: "India",
    category: "Rooms",
    propertyType: "Cabin",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Meadow view", "Mountain view", "Campfire", "Home food", "Hiking trails"],
    featured: false,
    geometry: { type: "Point", coordinates: [74.5667, 33.8667] },
    hostIndex: 6
  },
  {
    title: "Zanskar Valley Remote Himalayan Retreat",
    description: "A transformative journey into one of the world's most remote mountain valleys in Padum, Zanskar. Ancient cliffside monasteries, Phuktal gompa treks, and warm Ladakhi butter tea.",
    images: [
      { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80", filename: "zanskar_1" }
    ],
    price: 3800,
    location: "Padum, Zanskar, Ladakh",
    country: "India",
    category: "Camping",
    propertyType: "House",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: ["Mountain view", "Traditional heating", "Local guides", "Home-cooked meals"],
    featured: false,
    geometry: { type: "Point", coordinates: [76.9000, 33.4667] },
    hostIndex: 6
  },
  {
    title: "Yusmarg Green Meadow Alpine Cottage",
    description: "Quiet mountain retreat in Yusmarg, surrounded by dense fir forests and Tatakooti peak. Crisp cool breeze, mountain pony trails to Nilnag lake, and warm Kashmiri hospitality.",
    images: [
      { url: "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=1200&q=80", filename: "yusmarg_1" }
    ],
    price: 3900,
    location: "Yusmarg, Kashmir",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: ["Mountain view", "Heating", "Free parking", "Meadow trails"],
    featured: false,
    geometry: { type: "Point", coordinates: [74.6667, 33.8333] },
    hostIndex: 6
  },

  // 81-90: Tamil Nadu & Pondicherry
  {
    title: "Pondicherry White Town French Colonial Villa",
    description: "Located on Rue Suffren in Pondicherry's historic French Quarter. Ochre yellow facades, arched louvred windows, bougainvillea hanging over private courtyards, and a short walk to the Promenade Beach.",
    images: [
      { url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80", filename: "pondi_1" },
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80", filename: "pondi_2" }
    ],
    price: 7200,
    location: "White Town, Pondicherry",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Villa",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Air conditioning", "Kitchen", "Courtyard", "Free parking", "Balcony"],
    featured: true,
    geometry: { type: "Point", coordinates: [79.8359, 11.9344] },
    hostIndex: 7
  },
  {
    title: "Ooty Nilgiri Tea Hills British Era Bungalow",
    description: "An authentic 1890s colonial stone residence overlooking the emerald Nilgiri tea hills. Enjoy open wood fireplaces, afternoon scones with clotted cream, and heritage toy train whistles echoing across the valley.",
    images: [
      { url: "https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=1200&q=80", filename: "ooty_1" }
    ],
    price: 6500,
    location: "Fernhill, Ooty, Nilgiris",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Fireplace", "Heating", "Garden view", "Free parking"],
    featured: true,
    geometry: { type: "Point", coordinates: [76.6953, 11.4102] },
    hostIndex: 7
  },
  {
    title: "Kodaikanal Pine Forest Misty Valley Chalet",
    description: "Perched near Pillar Rocks in Princess of Hill Stations, Kodaikanal. Surrounded by eucalyptus and pine trees, with private valley views, crackling hearth, and easy access to Kodai Lake.",
    images: [
      { url: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80", filename: "kodai_1" }
    ],
    price: 5400,
    location: "Pillar Rocks Road, Kodaikanal",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Fireplace", "Garden view", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.4892, 10.2381] },
    hostIndex: 7
  },
  {
    title: "Chettinad Ancestral Palace Mansion",
    description: "Live like a Chettiar merchant prince in Karaikudi. Colossal teak pillars imported from Burma, Belgian mirrors, Italian marble, Athangudi handmade tiles, and world-renowned spicy Chettinad banquets.",
    images: [
      { url: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80", filename: "chettinad_1" }
    ],
    price: 8900,
    location: "Kanadukathan, Chettinad",
    country: "India",
    category: "Castles",
    propertyType: "Haveli",
    maxGuests: 6,
    bedrooms: 3,
    beds: 3,
    bathrooms: 3,
    amenities: ["Wifi", "Air conditioning", "Breakfast included", "Courtyard", "Heritage tour", "Free parking"],
    featured: true,
    geometry: { type: "Point", coordinates: [78.7844, 10.1653] },
    hostIndex: 7
  },
  {
    title: "Mahabalipuram Shore Temple Beachfront Villa",
    description: "Direct beach access near the 8th-century UNESCO Shore Temple. Private pool, palm trees, ocean surf sounds, and stone artisans carving sculptures along the quiet coastal lanes.",
    images: [
      { url: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80", filename: "mahabs_1" }
    ],
    price: 11000,
    location: "ECR Beach, Mahabalipuram",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Villa",
    maxGuests: 8,
    bedrooms: 4,
    beds: 4,
    bathrooms: 4,
    amenities: ["Wifi", "Pool", "Air conditioning", "Beach access", "Sea view", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [80.1983, 12.6269] },
    hostIndex: 7
  },
  {
    title: "Yercaud Coffee Lake View Hill Cottage",
    description: "Quiet Jewel of the South in Shevaroy Hills. Overlooking Emerald Lake and orange groves. Pleasant year-round climate, spice plantation walks, and peaceful mountain sunrises.",
    images: [
      { url: "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=1200&q=80", filename: "yercaud_1" }
    ],
    price: 3600,
    location: "Lady's Seat, Yercaud",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Mountain view", "Garden view", "Free parking", "Kitchenette"],
    featured: false,
    geometry: { type: "Point", coordinates: [78.2093, 11.7753] },
    hostIndex: 7
  },
  {
    title: "Madurai Meenakshi Temple View Penthouse",
    description: "Marvel at the towering colorful gopurams of the sacred Meenakshi Amman Temple from your private terrace. Authentic Madurai street food trails, jasmine flower scents, and modern luxury comforts.",
    images: [
      { url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80", filename: "madurai_1" }
    ],
    price: 4200,
    location: "West Tower Street, Madurai",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Temple view", "Balcony", "Free parking", "Elevator"],
    featured: false,
    geometry: { type: "Point", coordinates: [78.1198, 9.9195] },
    hostIndex: 7
  },
  {
    title: "Rameshwaram Coastal Coral Beach House",
    description: "Located on Pamban Island near the famous sea bridge and Ramanathaswamy temple. Clean pristine waters of the Gulf of Mannar, flamingo sightings at Dhanushkodi, and serene coastal living.",
    images: [
      { url: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=80", filename: "rameshwaram_1" }
    ],
    price: 3700,
    location: "Agni Theertham, Rameshwaram",
    country: "India",
    category: "Rooms",
    propertyType: "House",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Sea view", "Free parking", "Kitchen"],
    featured: false,
    geometry: { type: "Point", coordinates: [79.3129, 9.2876] },
    hostIndex: 7
  },
  {
    title: "Kanyakumari Lands End Ocean Confluence Suite",
    description: "At the southernmost tip of mainland India where the Arabian Sea, Bay of Bengal, and Indian Ocean meet. Watch both sunrise and sunset over the water from the same private balcony.",
    images: [
      { url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=80", filename: "kanya_1" }
    ],
    price: 4800,
    location: "Cape Comorin, Kanyakumari",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Apartment",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Ocean view", "Balcony", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [77.5385, 8.0883] },
    hostIndex: 7
  },
  {
    title: "Auroville Eco Earth Dome Sanctuary",
    description: "Built with compressed stabilized earth blocks within the green belt of international township Auroville. Quiet bamboo groves, organic farm meals, bicycle paths, and silent meditation at the Matrimandir.",
    images: [
      { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80", filename: "auroville_1" }
    ],
    price: 3300,
    location: "Auroville, Villupuram",
    country: "India",
    category: "Domes",
    propertyType: "Other",
    maxGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    amenities: ["Wifi", "Garden view", "Bicycle provided", "Organic food", "Kitchenette"],
    featured: false,
    geometry: { type: "Point", coordinates: [79.8105, 12.0070] },
    hostIndex: 7
  },

  // 91-100: East, North East, Central & Islands
  {
    title: "Darjeeling Kanchenjunga View Planter's Bungalow",
    description: "Historic Victorian tea planter's estate facing the world's third highest mountain Kanchenjunga. Sip vintage First Flush Darjeeling tea beside crackling cedar fireplaces as morning sun rays turn peaks golden.",
    images: [
      { url: "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?auto=format&fit=crop&w=1200&q=80", filename: "darjeeling_1" },
      { url: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80", filename: "darjeeling_2" }
    ],
    price: 7600,
    location: "Ghum, Darjeeling",
    country: "India",
    category: "Mountains",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Fireplace", "Heating", "Breakfast included", "Tea tasting"],
    featured: true,
    geometry: { type: "Point", coordinates: [88.2627, 27.0410] },
    hostIndex: 6
  },
  {
    title: "Gangtok Himalayan Snow Vista Penthouse",
    description: "High above Sikkim's capital Gangtok with wraparound glass walls framing the Eastern Himalayas. Heated wooden floors, Tibetan prayer flag terrace, and close to Rumtek Monastery.",
    images: [
      { url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80", filename: "gangtok_1" }
    ],
    price: 6200,
    location: "Development Area, Gangtok, Sikkim",
    country: "India",
    category: "Mountains",
    propertyType: "Apartment",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Heating", "Balcony", "Free parking", "Kitchen"],
    featured: false,
    geometry: { type: "Point", coordinates: [88.6138, 27.3314] },
    hostIndex: 6
  },
  {
    title: "Shillong Pine Forest Scottish Highlands Cottage",
    description: "In the Scotland of the East, Shillong. Cozy wooden cottage tucked into dense pine groves near Ward's Lake. Enjoy Meghalaya's indie music scene, nearby Umiam Lake, and living root bridge day trips.",
    images: [
      { url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80", filename: "shillong_1" }
    ],
    price: 4900,
    location: "Laitumkhrah, Shillong, Meghalaya",
    country: "India",
    category: "Trending",
    propertyType: "Cottage",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Mountain view", "Fireplace", "Breakfast included", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [91.8933, 25.5788] },
    hostIndex: 6
  },
  {
    title: "Kaziranga Rhino Safari Wild Jungle Lodge",
    description: "Set right beside the tea gardens bordering Kaziranga National Park in Assam. Home to two-thirds of the world's great one-horned rhinoceroses. Open-air pool, ethnic Assamese thali, and elephant safaris.",
    images: [
      { url: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=1200&q=80", filename: "kaziranga_1" }
    ],
    price: 8800,
    location: "Kohora, Kaziranga, Assam",
    country: "India",
    category: "Amazing Pools",
    propertyType: "Resort",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Pool", "All meals included", "Safari booking", "Air conditioning", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [93.4167, 26.5833] },
    hostIndex: 6
  },
  {
    title: "Varanasi Sacred Ganga Ghat Heritage Suite",
    description: "Directly overlooking the holy Assi Ghat on the sacred river Ganges in Kashi. Watch ancient dawn subah-e-banaras rituals from your sandstone balcony, listen to temple shehnai music, and savor Banarasi kachoris.",
    images: [
      { url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80", filename: "varanasi_1" }
    ],
    price: 5400,
    location: "Assi Ghat, Varanasi",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Haveli",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "River view", "Balcony", "Breakfast included", "Boat tour"],
    featured: true,
    geometry: { type: "Point", coordinates: [83.0067, 25.2882] },
    hostIndex: 7
  },
  {
    title: "Agra Taj View Luxury Rooftop Villa",
    description: "Direct, unobstructed panoramic views of the Taj Mahal from your private rooftop jacuzzi. Watch the white marble wonder turn pink at sunrise and glow under the full moon in the quiet Tajganj quarter.",
    images: [
      { url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1200&q=80", filename: "agra_1" }
    ],
    price: 8600,
    location: "Tajganj, Agra",
    country: "India",
    category: "Iconic Cities",
    propertyType: "Villa",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Monument view", "Hot tub", "Kitchen", "Free parking"],
    featured: true,
    geometry: { type: "Point", coordinates: [78.0421, 27.1751] },
    hostIndex: 7
  },
  {
    title: "Rann of Kutch White Desert Luxury Bhunga",
    description: "Stay in traditional round Kutchi Bhunga huts decorated with intricate mud mirror lipan art and vibrant tie-dye bandhani textiles. Walk across the endless white salt desert under the full moon at Dhordo.",
    images: [
      { url: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1200&q=80", filename: "kutch_1" }
    ],
    price: 6400,
    location: "Dhordo, Rann of Kutch, Gujarat",
    country: "India",
    category: "Camping",
    propertyType: "Other",
    maxGuests: 4,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Air conditioning", "All meals included", "Cultural performance", "Desert tour"],
    featured: true,
    geometry: { type: "Point", coordinates: [69.5167, 23.8333] },
    hostIndex: 3
  },
  {
    title: "Gir Forest Asiatic Lion Sanctuary Lodge",
    description: "The only place in the wild on earth to witness the majestic Asiatic Lion. Situated along Hiran river in Sasan Gir with mango orchards, evening lion safari guides, and authentic Kathiyawadi cuisine.",
    images: [
      { url: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=1200&q=80", filename: "gir_1" }
    ],
    price: 9200,
    location: "Sasan Gir, Junagadh, Gujarat",
    country: "India",
    category: "Farms",
    propertyType: "Resort",
    maxGuests: 5,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    amenities: ["Wifi", "Pool", "Air conditioning", "Safari booking", "Meals included", "Free parking"],
    featured: false,
    geometry: { type: "Point", coordinates: [70.5986, 21.1344] },
    hostIndex: 3
  },
  {
    title: "Havelock Island Radhanagar Beach Eco Villa",
    description: "Steps from Radhanagar Beach (Asia's Best Beach) in the Andaman Islands. Pure white powder sands, crystal-clear turquoise waters, coral reef scuba diving, and sustainable Andaman padauk wood villas.",
    images: [
      { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80", filename: "havelock_1" }
    ],
    price: 12500,
    location: "Radhanagar Beach, Havelock Island, Andamans",
    country: "India",
    category: "Rooms",
    propertyType: "Villa",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    amenities: ["Wifi", "Air conditioning", "Beach access", "Sea view", "Scuba diving partner", "Restaurant"],
    featured: true,
    geometry: { type: "Point", coordinates: [92.9800, 11.9800] },
    hostIndex: 1
  },
  {
    title: "Neil Island Coral Garden Beachfront Cottage",
    description: "Tranquil tropical paradise on Neil Island (Shaheed Dweep). Natural rock bridge, snorkeling among bioluminescent sea turtles, fresh coconut water straight from palms, and pristine peaceful shores.",
    images: [
      { url: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=80", filename: "neil_1" }
    ],
    price: 7400,
    location: "Laxmanpur Beach, Neil Island, Andamans",
    country: "India",
    category: "Rooms",
    propertyType: "Cottage",
    maxGuests: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    amenities: ["Wifi", "Air conditioning", "Sea view", "Beach access", "Bicycles provided", "Free breakfast"],
    featured: false,
    geometry: { type: "Point", coordinates: [93.0500, 11.8333] },
    hostIndex: 1
  }
];

async function seed100() {
  await mongoose.connect(dbUrl);
  console.log("Connected to MongoDB for 100-listing seeding.");

  // 1. Ensure hosts exist
  const hostUserIds = [];
  for (const host of hostProfiles) {
    let u = await User.findOne({ username: host.username });
    if (!u) {
      const newHost = new User({
        username: host.username,
        email: host.email,
        role: "host",
      });
      u = await User.register(newHost, "password123");
      console.log(`Created Host Account: @${u.username}`);
    } else {
      if (u.role !== "host" && u.role !== "admin") {
        u.role = "host";
        await u.save();
      }
    }
    hostUserIds.push(u._id);
  }

  console.log(`Initialized ${hostUserIds.length} host accounts for diverse property ownership.`);

  // 2. Upsert the listings idempotently by title
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < listings100.length; i++) {
    const item = listings100[i];
    const hostId = hostUserIds[item.hostIndex % hostUserIds.length];

    const listingPayload = {
      title: item.title,
      description: item.description,
      image: item.images[0],
      images: item.images,
      price: item.price,
      location: item.location,
      country: item.country,
      category: item.category,
      propertyType: item.propertyType,
      maxGuests: item.maxGuests,
      bedrooms: item.bedrooms,
      beds: item.beds,
      bathrooms: item.bathrooms,
      amenities: item.amenities,
      isPublished: true,
      status: "approved",
      rejectionReason: "",
      featured: item.featured || false,
      geometry: item.geometry,
      owner: hostId,
    };

    const existing = await Listing.findOne({ title: item.title });
    if (existing) {
      await Listing.updateOne({ _id: existing._id }, { $set: listingPayload });
      updated++;
    } else {
      await Listing.create(listingPayload);
      inserted++;
    }
  }

  const totalCount = await Listing.countDocuments();
  console.log(`Seed 100 Completed! Created: ${inserted}, Updated: ${updated}. Total Listings in DB: ${totalCount}`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
  process.exit(0);
}

seed100().catch((err) => {
  console.error("Seed 100 failed:", err);
  process.exit(1);
});
