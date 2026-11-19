const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const passportLocalMongoose =
  require("passport-local-mongoose").default ||
  require("passport-local-mongoose");

const userSchema = new Schema({
  fullName: {
    type: String,
    trim: true,
    default: "",
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  mobile: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  profileImage: {
    url: {
      type: String,
      default: "",
    },
    filename: {
      type: String,
      default: "",
    },
  },
  role: {
    type: String,
    enum: ["user", "host", "admin"],
    default: "user",
  },
  twoFactor: {
    enabled: {
      type: Boolean,
      default: false,
    },
    secret: {
      type: String,
      default: null,
    },
    tempSecret: {
      type: String,
      default: null,
    },
    recoveryCodes: [
      {
        codeHash: { type: String, required: true },
        used: { type: Boolean, default: false },
        usedAt: { type: Date, default: null },
      },
    ],
    enrolledAt: {
      type: Date,
      default: null,
    },
  },
  savedListings: [
    {
      type: Schema.Types.ObjectId,
      ref: "Listing",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.plugin(passportLocalMongoose, {
  usernameField: "username",
});

module.exports = mongoose.model("User", userSchema);
