const User = require("../models/user.js");

/**
 * Reconciles and ensures the primary administrator account exists
 * in MongoDB with role 'admin' and active credentials from .env.
 */
async function reconcilePrimaryAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim().toLowerCase() : null;
  const adminPassword = process.env.ADMIN_PASSWORD || null;
  const adminUsername = process.env.ADMIN_USERNAME || "admin";

  if (!adminEmail || !adminPassword) {
    console.log("[AdminReconcile] Skipping primary admin reconciliation: ADMIN_EMAIL or ADMIN_PASSWORD not set.");
    return null;
  }

  try {
    let adminUser = await User.findOne({
      $or: [
        { email: adminEmail },
        { username: "demo" },
        { username: adminUsername },
      ],
    });

    if (adminUser) {
      adminUser.role = "admin";
      adminUser.email = adminEmail;
      if (!adminUser.fullName) {
        adminUser.fullName = "Sohel Shaikh";
      }
      if (adminPassword) {
        await adminUser.setPassword(adminPassword);
      }
      await adminUser.save();
      console.log(`[AdminReconcile] Primary admin reconciled: ${adminUser.email} (${adminUser.username}) -> role: 'admin'`);
      return adminUser;
    } else {
      const newAdmin = new User({
        username: adminUsername,
        email: adminEmail,
        fullName: "Sohel Shaikh",
        role: "admin",
      });
      const registered = await User.register(newAdmin, adminPassword);
      console.log(`[AdminReconcile] Primary admin created: ${registered.email} -> role: 'admin'`);
      return registered;
    }
  } catch (err) {
    console.error("[AdminReconcile] Reconciliation warning:", err.message);
    return null;
  }
}

module.exports = { reconcilePrimaryAdmin };
