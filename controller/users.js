const User = require("../models/user.js");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const { autoUpdateCompletedBookings } = require("../utils/bookingLifecycle.js");

module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
  try {
    let { fullName, email, mobile, username, password, confirmPassword } = req.body;

    fullName = (fullName || "").trim();
    email = (email || "").trim().toLowerCase();
    mobile = (mobile || "").trim();
    username = (username || "").trim();
    password = password || "";
    confirmPassword = confirmPassword || "";

    // 1. Mandatory Name Validation
    if (!fullName) {
      req.flash("error", "Full name is required.");
      return res.redirect("/signup");
    }

    // 2. Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      req.flash("error", "Please provide a valid email address.");
      return res.redirect("/signup");
    }

    // 3. Mobile Number Validation (10 to 15 digits)
    const phoneDigits = mobile.replace(/\D/g, "");
    if (!mobile || phoneDigits.length < 10 || phoneDigits.length > 15) {
      req.flash("error", "Please provide a valid mobile number (10-15 digits).");
      return res.redirect("/signup");
    }

    // 4. Password Length & Match Validation
    if (password.length < 8) {
      req.flash("error", "Password must be at least 8 characters long.");
      return res.redirect("/signup");
    }
    if (password !== confirmPassword) {
      req.flash("error", "Passwords do not match.");
      return res.redirect("/signup");
    }

    // 5. Auto-generate or sanitize username
    if (!username) {
      const baseSlug = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "");
      username = baseSlug || fullName.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
      // Check if username taken, append random suffix if needed
      const existingUserSlug = await User.findOne({ username: new RegExp("^" + username + "$", "i") });
      if (existingUserSlug) {
        username = `${username}_${Math.floor(100 + Math.random() * 900)}`;
      }
    } else {
      const existingUsername = await User.findOne({ username: new RegExp("^" + username + "$", "i") });
      if (existingUsername) {
        req.flash("error", "That username is already taken. Please choose another.");
        return res.redirect("/signup");
      }
    }

    // 6. Check unique email & mobile
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      req.flash("error", "An account with this email already exists. Please log in.");
      return res.redirect("/signup");
    }

    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      req.flash("error", "An account with this mobile number already exists.");
      return res.redirect("/signup");
    }

    // 7. Register new user
    const newUser = new User({
      fullName,
      email,
      mobile,
      username,
      role: "user",
    });

    const registeredUser = await User.register(newUser, password);
    req.login(registeredUser, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", `Welcome to WanderLust, ${registeredUser.fullName || registeredUser.username}!`);
      res.redirect("/listings");
    });
  } catch (e) {
    req.flash("error", e.message || "Registration failed. Please try again.");
    res.redirect("/signup");
  }
};

module.exports.renderLoginForm = (req, res) => {
  res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
  const redirectUrl = res.locals.redirectUrl;

  // Role-based redirects: Administrators go to dashboard by default
  if (req.user && req.user.role === "admin") {
    if (redirectUrl && !redirectUrl.includes("/login") && !redirectUrl.includes("/signup") && redirectUrl !== "/listings") {
      return res.redirect(redirectUrl);
    }
    req.flash("success", `Welcome back, Admin ${req.user.fullName || req.user.username}!`);
    return res.redirect("/admin/dashboard");
  }

  req.flash("success", `Welcome back, ${req.user.fullName || req.user.username}!`);
  res.redirect(redirectUrl || "/listings");
};

module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "Successfully logged out!");
    res.redirect("/listings");
  });
};

module.exports.profile = async (req, res) => {
  await autoUpdateCompletedBookings();

  // Inspect raw savedListings count to detect any dangling or deleted listing references
  const rawUser = await User.findById(req.user._id).select("savedListings");
  const rawCount = (rawUser && rawUser.savedListings && rawUser.savedListings.length) || 0;

  const user = await User.findById(req.user._id).populate({
    path: "savedListings",
    populate: { path: "reviews" },
  });

  // Filter out any null or missing savedListings (in case a listing was deleted)
  const savedListings = [];
  if (user && Array.isArray(user.savedListings)) {
    for (let item of user.savedListings) {
      if (item && item._id) {
        savedListings.push(item);
      }
    }
  }

  // Self-heal: If any saved listing was deleted, synchronize user.savedListings in DB to remove orphaned IDs
  if (savedListings.length !== rawCount) {
    const validIds = savedListings.map((l) => l._id);
    await User.findByIdAndUpdate(req.user._id, { savedListings: validIds });
    if (user) {
      user.savedListings = savedListings;
    }
  }

  const bookings = await Booking.find({ user: req.user._id })
    .populate({
      path: "listing",
      populate: { path: "owner" },
    })
    .sort({ createdAt: -1 });

  const now = new Date();
  const upcomingBookings = bookings.filter(
    (b) => (b.status === "Pending" || b.status === "Confirmed") && new Date(b.checkOut) >= now
  );
  const completedBookings = bookings.filter((b) => b.status === "Completed");
  const cancelledBookings = bookings.filter(
    (b) => b.status === "Cancelled" || b.status === "Rejected"
  );

  const myListings = await Listing.find({ owner: req.user._id }).sort({ createdAt: -1 });

  res.render("users/profile.ejs", {
    user,
    bookings,
    upcomingBookings,
    completedBookings,
    cancelledBookings,
    myListings,
    savedListings,
  });
};

module.exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/login");
    }

    let { fullName, email, mobile } = req.body;
    if (fullName && fullName.trim()) {
      user.fullName = fullName.trim();
    }

    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        req.flash("error", "Please provide a valid email address.");
        return res.redirect("/profile");
      }
      const existing = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } });
      if (existing) {
        req.flash("error", "Email is already used by another account.");
        return res.redirect("/profile");
      }
      user.email = cleanEmail;
    }

    if (mobile && mobile.trim()) {
      const cleanMobile = mobile.trim();
      const phoneDigits = cleanMobile.replace(/\D/g, "");
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        req.flash("error", "Please enter a valid mobile number (10-15 digits).");
        return res.redirect("/profile");
      }
      const existing = await User.findOne({ mobile: cleanMobile, _id: { $ne: user._id } });
      if (existing) {
        req.flash("error", "Mobile number is already used by another account.");
        return res.redirect("/profile");
      }
      user.mobile = cleanMobile;
    }

    if (req.file) {
      let fileUrl = req.file.path;
      if (fileUrl && !fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
        const path = require("path");
        const filename = req.file.filename || path.basename(req.file.path);
        fileUrl = `/uploads/${filename}`;
      }
      user.profileImage = {
        url: fileUrl,
        filename: req.file.filename || "profile-image",
      };
    }

    await user.save();
    req.flash("success", "Profile details updated successfully!");
    res.redirect("/profile");
  } catch (err) {
    req.flash("error", err.message || "Failed to update profile.");
    res.redirect("/profile");
  }
};

module.exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      req.flash("error", "All password fields are required.");
      return res.redirect("/profile");
    }

    if (newPassword.length < 8) {
      req.flash("error", "New password must be at least 8 characters long.");
      return res.redirect("/profile");
    }

    if (newPassword !== confirmNewPassword) {
      req.flash("error", "New password and confirmation do not match.");
      return res.redirect("/profile");
    }

    const user = await User.findById(req.user._id);
    await user.changePassword(currentPassword, newPassword);
    req.flash("success", "Password updated successfully!");
    res.redirect("/profile");
  } catch (err) {
    if (err.name === "IncorrectPasswordError") {
      req.flash("error", "Current password is incorrect.");
    } else {
      req.flash("error", err.message || "Could not change password.");
    }
    res.redirect("/profile");
  }
};
