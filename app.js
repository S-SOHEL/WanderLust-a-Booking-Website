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

const LOCAL_MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
const isProduction = process.env.NODE_ENV === "production";

function resolveDatabaseConfig() {
  if (isProduction) {
    if (!process.env.ATLASDB_URL || !process.env.ATLASDB_URL.trim()) {
      console.error("FATAL CONFIG ERROR: ATLASDB_URL is required when NODE_ENV=production.");
      process.exit(1);
    }
    return { url: process.env.ATLASDB_URL.trim(), label: "MongoDB Atlas (Production)" };
  }

  // Non-production: prefer dedicated cloud development DB if explicitly configured
  const devAtlasUrl = process.env.DEV_ATLASDB_URL ? process.env.DEV_ATLASDB_URL.trim() : "";
  if (devAtlasUrl && process.env.USE_CLOUD_DEV !== "false") {
    const prodAtlasUrl = process.env.ATLASDB_URL ? process.env.ATLASDB_URL.trim() : "";
    if (prodAtlasUrl && devAtlasUrl === prodAtlasUrl) {
      console.error("FATAL CONFIG ERROR: DEV_ATLASDB_URL must not match production ATLASDB_URL.");
      process.exit(1);
    }
    return { url: devAtlasUrl, label: "MongoDB Atlas (Cloud Development)" };
  }

  const localUrl = (process.env.MONGO_URL || LOCAL_MONGO_URL).trim();
  return {
    url: localUrl,
    label: localUrl.includes("127.0.0.1") || localUrl.includes("localhost")
      ? "Local MongoDB (localhost:27017)"
      : "Configured Development MongoDB",
  };
}

// Validate Evidence Vault configuration
const { validateProductionVaultConfiguration } = require("./services/evidenceVault.js");
try {
  const vaultStatus = validateProductionVaultConfiguration();
  if (vaultStatus && vaultStatus.mode === "production") {
    console.log("Evidence Vault initialized in production mode with persistent disk.");
  }
} catch (vaultErr) {
  // On Render Free tier where persistent disks or dedicated keys are not configured,
  // log a clear notice and do not crash the public web application.
  console.warn("Evidence Vault Notice (Free Tier Compatibility):", vaultErr.message);
}

const dbConfig = resolveDatabaseConfig();
const dbUrl = dbConfig.url;

mongoose.connection.on("error", (err) => {
  console.error("MongoDB Runtime Connection Error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection lost.");
});

// Single shared connection promise reused by both Mongoose and connect-mongo (no duplicate pools)
const dbConnectionPromise = mongoose.connect(dbUrl);

dbConnectionPromise
  .then((m) => {
    console.log(`Connected to DB: ${dbConfig.label} [database: ${m.connection.name}]`);
    // Start background schedulers and admin reconciliation only after DB is connected
    const { startBookingLifecycleScheduler } = require("./utils/bookingLifecycle.js");
    startBookingLifecycleScheduler(15 * 60 * 1000);

    const { reconcilePrimaryAdmin } = require("./utils/adminReconcile.js");
    reconcilePrimaryAdmin();

    // Synchronize evidence ledger cache from persistent database
    const { syncLedgerFromDatabase } = require("./utils/evidenceLedger.js");
    syncLedgerFromDatabase().catch((syncErr) => {
      console.warn("Evidence ledger startup sync notice:", syncErr.message);
    });
  })
  .catch((err) => {
    console.error("DB Initial Connection Error:", err.message);
    if (isProduction) {
      process.exit(1);
    }
  });

// Enable trust proxy for secure cookies and accurate client IP behind reverse proxies (e.g. Render / Heroku)
if (isProduction || process.env.TRUST_PROXY) {
  const trustValue = process.env.TRUST_PROXY
    ? (!isNaN(Number(process.env.TRUST_PROXY)) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY)
    : 1;
  app.set("trust proxy", trustValue);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));
app.use("/uploads", express.static(path.join(__dirname, "/uploads")));

// MongoDB session store sharing the primary Mongoose client (no duplicate MongoClient connections)
const store = MongoStore.create({
  clientPromise: dbConnectionPromise.then((m) => m.connection.getClient()),
  crypto: {
    secret: process.env.SECRET || "mysupersecretcode",
  },
  touchAfter: 24 * 3600, // time period in seconds
});

store.on("error", (err) => {
  console.error("Session Store Error:", err.message);
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
    secure: isProduction,
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

// Global template locals (auth, flash messages, admin pending badges)
app.use(async (req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.warning = req.flash("warning");
  res.locals.info = req.flash("info");
  res.locals.currUser = req.user;
  res.locals.currentPath = req.path || "/";
  res.locals.mapToken = process.env.MAP_TOKEN || "";

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
  console.error("Error caught in middleware:", err.message || err);

  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong!";

  if (err.name === "MulterError") {
    statusCode = 400;
    message = err.code === "LIMIT_FILE_SIZE"
      ? "Uploaded file is too large. Maximum allowed size is 5 MB per image."
      : err.message;
  } else if (err.message && err.message.includes("Only image files")) {
    statusCode = 400;
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid identifier provided.";
  } else if (isProduction && statusCode >= 500) {
    message = "An unexpected server error occurred. Please try again shortly.";
  }

  if (req.xhr || (req.headers.accept && req.headers.accept.includes("application/json") && !req.headers.accept.includes("text/html"))) {
    return res.status(statusCode).json({ success: false, error: message });
  }
  res.status(statusCode).render("error", { err: isProduction ? { statusCode, message } : err, message, statusCode });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`server is listening to port ${port}`);
});
