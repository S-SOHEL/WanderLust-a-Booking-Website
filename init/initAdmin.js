/**
 * Secure Admin Initialization & Reconciliation Script
 * Usage: node init/initAdmin.js
 */

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
}

const mongoose = require("mongoose");
const { reconcilePrimaryAdmin } = require("../utils/adminReconcile.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
const dbUrl =
  process.env.NODE_ENV === "production" || process.env.USE_ATLAS === "true"
    ? process.env.ATLASDB_URL || MONGO_URL
    : process.env.MONGO_URL || MONGO_URL;

async function main() {
  await mongoose.connect(dbUrl);
  console.log("Connected to MongoDB for admin initialization/reconciliation.");

  const admin = await reconcilePrimaryAdmin();
  console.log("Admin account successfully reconciled:", admin.email);

  await mongoose.disconnect();
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Admin initialization failed:", err);
  process.exit(1);
});
