if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const Booking = require("./models/booking.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const bookingRouter = require("./routes/booking.js");
const adminRouter = require("./routes/admin.js");
const aiRouter = require("./routes/ai.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

let dbUrl = process.env.MONGO_URL || MONGO_URL;
if (process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true") {
  if (!process.env.ATLASDB_URL) {
    if (process.env.NODE_ENV === "production") {
      console.error("FATAL CONFIG ERROR: ATLASDB_URL is required in production environment.");
      process.exit(1);
    }
    console.warn("WARNING: USE_ATLAS=true but ATLASDB_URL is not set; falling back to local MongoDB.");
  } else {
    dbUrl = process.env.ATLASDB_URL;
  }
}

main()
  .then(() => {
    console.log(
      "connected to DB:",
      dbUrl.includes("127.0.0.1") ? "Local MongoDB (localhost:27017)" : "MongoDB Atlas"
    );
  })
  .catch((err) => {
    console.log("DB Connection Error:", err);
  });

async function main() {
  await mongoose.connect(dbUrl);
}

// Enable trust proxy for secure cookies behind reverse proxies (e.g. Render / Heroku)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));
app.use("/uploads", express.static(path.join(__dirname, "/uploads")));

// MongoDB session store
const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET || "mysupersecretcode",
  },
  touchAfter: 24 * 3600, // time period in seconds
});

store.on("error", (err) => {
  console.log("Session Store Error:", err);
});

const sessionOptions = {
  store,
  secret: process.env.SECRET || "mysupersecretcode",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

// Dual Login LocalStrategy: Supports Email, Mobile Number, or Username + Password
passport.use(
  new LocalStrategy(
    { usernameField: "username", passwordField: "password" },
    async (identifier, password, done) => {
      try {
        if (!identifier || !password) {
          return done(null, false, { message: "Identifier and password are required." });
        }
        const clean = String(identifier).trim();
        const user = await User.findOne({
          $or: [
            { email: clean.toLowerCase() },
            { mobile: clean },
            { username: new RegExp("^" + clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
          ],
        });
        if (!user) {
          return done(null, false, { message: "Invalid email, mobile number, or password." });
        }
        const authResult = await user.authenticate(password);
        if (authResult.error || !authResult.user) {
          return done(null, false, { message: "Invalid email, mobile number, or password." });
        }
        return done(null, authResult.user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Auto-transition past checkout bookings to Completed via background scheduler
const { startBookingLifecycleScheduler } = require("./utils/bookingLifecycle.js");
startBookingLifecycleScheduler(15 * 60 * 1000);

// Reconcile primary platform administrator
const { reconcilePrimaryAdmin } = require("./utils/adminReconcile.js");
reconcilePrimaryAdmin();

// Global template locals (auth, flash messages, admin pending badges)
app.use(async (req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;

  // Provide pending bookings and listings count for admin notification pill
  if (req.user && req.user.role === "admin") {
    try {
      const Listing = require("./models/listing.js");
      const [pendingBookings, pendingListings] = await Promise.all([
        Booking.countDocuments({ status: "Pending" }),
        Listing.countDocuments({ status: "pending" }),
      ]);
      res.locals.pendingBookingsCount = pendingBookings;
      res.locals.pendingListingsCount = pendingListings;
      res.locals.adminAlertCount = pendingBookings + pendingListings;
    } catch (e) {
      res.locals.pendingBookingsCount = 0;
      res.locals.pendingListingsCount = 0;
      res.locals.adminAlertCount = 0;
    }
  } else {
    res.locals.pendingBookingsCount = 0;
    res.locals.pendingListingsCount = 0;
    res.locals.adminAlertCount = 0;
  }
  next();
});

// Root Route - Redirects to /listings
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// Mount Application Routes
app.use("/admin", adminRouter);
app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/api/ai", aiRouter);
app.use("/", bookingRouter);
app.use("/", userRouter);

// 404 Handler
app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page Not Found !"));
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.log("Error caught in middleware:", err);
  const { statusCode = 500, message = "Something went wrong!" } = err;
  res.status(statusCode).render("error", { err, message, statusCode });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`server is listening to port ${port}`);
});
