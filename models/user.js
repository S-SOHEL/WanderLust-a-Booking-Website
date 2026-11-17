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
