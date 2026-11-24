const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js");

const listingSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  image: {
    url: {
      type: String,
      default: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=800&q=60",
    },
    filename: {
      type: String,
      default: "listingimage",
    },
  },
  images: [
    {
      url: {
        type: String,
        required: true,
      },
      filename: {
        type: String,
        default: "listingimage",
      },
    },
  ],
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  address: {
    type: String,
    trim: true,
    default: "",
  },
  city: {
    type: String,
    trim: true,
    default: "",
  },
  state: {
    type: String,
    trim: true,
    default: "",
  },
  location: {
    type: String,
    required: true,
    trim: true,
  },
  country: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    enum: [
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
    ],
    default: "Trending",
  },
  propertyType: {
    type: String,
    enum: [
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
    ],
    default: "Apartment",
  },
  maxGuests: {
    type: Number,
    default: 2,
    min: 1,
  },
  bedrooms: {
    type: Number,
    default: 1,
    min: 0,
  },
  beds: {
    type: Number,
    default: 1,
    min: 1,
  },
  bathrooms: {
    type: Number,
    default: 1,
    min: 1,
  },
  amenities: {
    type: [String],
    default: ["Wifi", "Air conditioning", "Kitchen"],
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "draft"],
    default: "pending",
  },
  rejectionReason: {
    type: String,
    default: "",
  },
  featured: {
    type: Boolean,
    default: false,
  },
  reviews: [
    {
      type: Schema.Types.ObjectId,
      ref: "Review",
    },
  ],
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  geometry: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      default: [], // No automatic Mumbai fallback for new submissions
    },
  },
  isLocationResolved: {
    type: Boolean,
    default: function () {
      return Boolean(
        this.geometry &&
          Array.isArray(this.geometry.coordinates) &&
          this.geometry.coordinates.length === 2 &&
          typeof this.geometry.coordinates[0] === "number" &&
          typeof this.geometry.coordinates[1] === "number" &&
          !isNaN(this.geometry.coordinates[0]) &&
          !isNaN(this.geometry.coordinates[1]) &&
          this.geometry.coordinates[0] >= -180 &&
          this.geometry.coordinates[0] <= 180 &&
          this.geometry.coordinates[1] >= -90 &&
          this.geometry.coordinates[1] <= 90 &&
          (this.geometry.coordinates[0] !== 0 || this.geometry.coordinates[1] !== 0)
      );
    },
  },
  locationResolutionNotes: {
    type: String,
    default: "",
  },
  locationAuditHistory: [
    {
      previousCoordinates: {
        type: [Number],
        default: [],
      },
      newCoordinates: {
        type: [Number],
        default: [],
      },
      previousLocation: {
        type: String,
        default: "",
      },
      newLocation: {
        type: String,
        default: "",
      },
      previousTitle: {
        type: String,
        default: "",
      },
      newTitle: {
        type: String,
        default: "",
      },
      remediatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      adminUsername: {
        type: String,
        default: "admin",
      },
      remediationReason: {
        type: String,
        default: "",
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  remediationFlag: {
    type: String,
    enum: [
      "NONE",
      "LOCATION_UNCERTAIN",
      "GENERIC_REGION_CENTROID",
      "TITLE_LOCATION_MISMATCH",
      "TEST_DATA_REQUIRES_REVIEW",
      "RESOLVED_VERIFIED",
    ],
    default: "NONE",
  },
  remediationNotes: {
    type: String,
    default: "",
  },
  remediationReviewStatus: {
    type: String,
    enum: ["PENDING_ADMIN_REVIEW", "IN_REVIEW", "RESOLVED", "EXEMPT_REGIONAL"],
    default: "RESOLVED",
  },
  coordinateSource: {
    type: String,
    enum: [
      "GEOJSON_INPUT",
      "MAPBOX_GEOCODE",
      "ADMIN_MANUAL_PIN",
      "INDICATIVE_LOCALITY_PIN",
      "ROOFTOP_ON_SITE_GPS",
      "MUNICIPAL_TAX_RECORD",
      "UNRESOLVED",
    ],
    default: "GEOJSON_INPUT",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-validation security middleware: Guarantee location integrity
listingSchema.pre("validate", function (next) {
  const hasValidCoords = Boolean(
    this.geometry &&
      Array.isArray(this.geometry.coordinates) &&
      this.geometry.coordinates.length === 2 &&
      typeof this.geometry.coordinates[0] === "number" &&
      typeof this.geometry.coordinates[1] === "number" &&
      !isNaN(this.geometry.coordinates[0]) &&
      !isNaN(this.geometry.coordinates[1]) &&
      this.geometry.coordinates[0] >= -180 &&
      this.geometry.coordinates[0] <= 180 &&
      this.geometry.coordinates[1] >= -90 &&
      this.geometry.coordinates[1] <= 90 &&
      (this.geometry.coordinates[0] !== 0 || this.geometry.coordinates[1] !== 0)
  );

  if (!hasValidCoords) {
    this.isLocationResolved = false;
    // Security: Unresolved coordinates can NEVER be published
    if (this.isPublished) {
      this.isPublished = false;
    }
    if (this.status === "approved") {
      this.status = "pending";
    }
  } else if (this.isLocationResolved === undefined || this.isLocationResolved === null) {
    this.isLocationResolved = true;
  }
  next();
});

// Indexes for fast searching and filtering
listingSchema.index({ location: "text", country: "text", title: "text" });
listingSchema.index({ category: 1, isPublished: 1, price: 1 });

// Post middleware: cascade delete reviews when a listing is deleted
listingSchema.post("findOneAndDelete", async (listing) => {
  if (listing && listing.reviews && listing.reviews.length > 0) {
    await Review.deleteMany({ _id: { $in: listing.reviews } });
  }
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
