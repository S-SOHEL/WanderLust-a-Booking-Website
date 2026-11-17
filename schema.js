const joi = require("joi");

const amenitiesSchema = joi
  .alternatives()
  .try(
    joi.array().items(joi.string().trim()),
    joi.string().trim()
  )
  .allow("", null);

module.exports.listingSchema = joi
  .object({
    listing: joi
      .object({
        title: joi.string().trim().required().messages({
          "string.empty": "Title cannot be empty.",
          "any.required": "Property title is required.",
        }),
        description: joi.string().trim().required().messages({
          "string.empty": "Description cannot be empty.",
          "any.required": "Property description is required.",
        }),
        location: joi.string().trim().required().messages({
          "string.empty": "Location is required.",
          "any.required": "Location is required.",
        }),
        address: joi.string().allow("", null),
        city: joi.string().allow("", null),
        state: joi.string().allow("", null),
        country: joi.string().trim().required().messages({
          "string.empty": "Country is required.",
          "any.required": "Country is required.",
        }),
        price: joi.number().min(0).required().messages({
          "number.base": "Price must be a valid number.",
          "number.min": "Price cannot be negative.",
          "any.required": "Price per night is required.",
        }),
        category: joi.string().allow("", null),
        propertyType: joi.string().allow("", null),
        maxGuests: joi.number().min(1).max(50).default(2),
        bedrooms: joi.number().min(0).default(1),
        beds: joi.number().min(1).default(1),
        bathrooms: joi.number().min(1).default(1),
        amenities: amenitiesSchema,
        isPublished: joi.alternatives().try(joi.boolean(), joi.string()).allow(null),
        featured: joi.alternatives().try(joi.boolean(), joi.string()).allow(null),
        status: joi.string().valid("pending", "approved", "rejected", "draft").allow("", null),
        image: joi.string().allow("", null),
        imageUrl: joi.string().allow("", null),
        imageUrls: joi
          .alternatives()
          .try(joi.array().items(joi.string()), joi.string())
          .allow("", null),
        coordinates: joi.string().allow("", null),
        latitude: joi.alternatives().try(joi.number(), joi.string().allow("")).allow(null),
        longitude: joi.alternatives().try(joi.number(), joi.string().allow("")).allow(null),
      })
      .required(),
    // Allow legitimate fields sent directly at top-level of form
    address: joi.string().allow("", null),
    city: joi.string().allow("", null),
    state: joi.string().allow("", null),
    amenities: amenitiesSchema,
    isPublished: joi.alternatives().try(joi.boolean(), joi.string()).allow("", null),
    featured: joi.alternatives().try(joi.boolean(), joi.string()).allow("", null),
    imageUrl: joi.string().allow("", null),
    imageUrls: joi
      .alternatives()
      .try(joi.array().items(joi.string()), joi.string())
      .allow("", null),
    latitude: joi.alternatives().try(joi.number(), joi.string().allow("")).allow(null),
    longitude: joi.alternatives().try(joi.number(), joi.string().allow("")).allow(null),
  })
  .unknown(true);

module.exports.reviewSchema = joi.object({
  review: joi
    .object({
      rating: joi.number().min(1).max(5).required().messages({
        "number.base": "Rating must be a number between 1 and 5.",
        "any.required": "Rating is required.",
      }),
      comment: joi.string().trim().required().messages({
        "string.empty": "Review comment cannot be empty.",
        "any.required": "Review comment is required.",
      }),
    })
    .required(),
});

module.exports.bookingSchema = joi.object({
  booking: joi
    .object({
      checkIn: joi.date().required().messages({
        "date.base": "Valid check-in date is required.",
        "any.required": "Check-in date is required.",
      }),
      checkOut: joi.date().greater(joi.ref("checkIn")).required().messages({
        "date.greater": "Check-out date must be after check-in date.",
        "any.required": "Check-out date is required.",
      }),
      totalGuests: joi.number().min(1).max(50).required().messages({
        "number.min": "At least 1 guest is required.",
        "any.required": "Number of guests is required.",
      }),
      specialRequests: joi.string().allow("", null),
    })
    .required(),
});
