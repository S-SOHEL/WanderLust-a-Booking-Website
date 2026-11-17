const assert = require("assert");
const mongoose = require("mongoose");
const Listing = require("../models/listing");
const User = require("../models/user");
const Booking = require("../models/booking");
const Review = require("../models/review");

async function executePhase9_3_5() {
  await mongoose.connect("mongodb://127.0.0.1:27017/wanderlust");
  const adminUser = await User.findOne({ role: "admin" });
  assert(adminUser, "Admin user must exist");

  console.log("Starting Phase 9.3.5 Approved Admin Remediation Execution...");
  const executionLog = [];

  // DECISION 1 — SERENGETI SAFARI LODGE
  const doc1 = await Listing.findById("6a835b69ee9059e578bd85df");
  assert(doc1, "Listing 1 (Serengeti) not found");
  assert.deepStrictEqual(doc1.geometry.coordinates, [34.823454, -6.270353]);
  const d1BeforePub = doc1.isPublished;
  doc1.remediationNotes = "Administrator decision: On HOLD. Exact lodge/camp coordinates require host confirmation before resolving.";
  // Strictly do not create coordinate-change audit entry for HOLD decision
  await doc1.save();
  executionLog.push({
    id: doc1._id.toString(),
    title: doc1.title,
    decision: "1C — HOLD",
    isPublishedBefore: d1BeforePub,
    isPublishedAfter: doc1.isPublished,
    coordinates: doc1.geometry.coordinates,
    remediationReviewStatus: doc1.remediationReviewStatus,
    notes: doc1.remediationNotes,
    auditEntryAdded: false,
  });

  // DECISION 2 — ADMIN-OWNED COSTA RICA/PUNE LISTING
  const doc2 = await Listing.findById("6a835c4c9cc3be0fc7a52ba8");
  assert(doc2, "Listing 2 not found");
  const d2BeforePub = doc2.isPublished;
  doc2.isPublished = false;
  doc2.status = "draft";
  doc2.remediationNotes = "Administrator decision: unpublished pending verification of actual property location and title.";
  doc2.locationAuditHistory.push({
    previousCoordinates: doc2.geometry.coordinates,
    newCoordinates: doc2.geometry.coordinates,
    previousLocation: doc2.location,
    newLocation: doc2.location,
    previousTitle: doc2.title,
    newTitle: doc2.title,
    remediatedBy: adminUser._id,
    adminUsername: adminUser.username || "demo",
    remediationReason: "Administrator decision: unpublished pending verification of actual property location and title.",
    timestamp: new Date(),
  });
  await doc2.save();
  executionLog.push({
    id: doc2._id.toString(),
    title: doc2.title,
    decision: "2C — UNPUBLISH / DRAFT",
    isPublishedBefore: d2BeforePub,
    isPublishedAfter: doc2.isPublished,
    coordinates: doc2.geometry.coordinates,
    remediationReviewStatus: doc2.remediationReviewStatus,
    auditReason: "Administrator decision: unpublished pending verification of actual property location and title.",
    auditEntryAdded: true,
  });

  // DECISION 3 — SOHEL-OWNED LISTING 3
  const doc3 = await Listing.findById("6a848560cd5fe570c378cbaf");
  assert(doc3, "Listing 3 not found");
  const d3BeforePub = doc3.isPublished;
  doc3.isPublished = false;
  doc3.status = "draft";
  doc3.remediationNotes = "Administrator decision: unpublished pending owner confirmation of actual property location and title.";
  doc3.locationAuditHistory.push({
    previousCoordinates: doc3.geometry.coordinates,
    newCoordinates: doc3.geometry.coordinates,
    previousLocation: doc3.location,
    newLocation: doc3.location,
    previousTitle: doc3.title,
    newTitle: doc3.title,
    remediatedBy: adminUser._id,
    adminUsername: adminUser.username || "demo",
    remediationReason: "Administrator decision: unpublished pending owner confirmation of actual property location and title.",
    timestamp: new Date(),
  });
  await doc3.save();
  executionLog.push({
    id: doc3._id.toString(),
    title: doc3.title,
    decision: "2C — UNPUBLISH / DRAFT",
    isPublishedBefore: d3BeforePub,
    isPublishedAfter: doc3.isPublished,
    coordinates: doc3.geometry.coordinates,
    remediationReviewStatus: doc3.remediationReviewStatus,
    auditReason: "Administrator decision: unpublished pending owner confirmation of actual property location and title.",
    auditEntryAdded: true,
  });

  // DECISION 4 — SOHEL-OWNED LISTING 4
  const doc4 = await Listing.findById("6a84b612ae28b2bb0537a4a6");
  assert(doc4, "Listing 4 not found");
  const d4BeforePub = doc4.isPublished;
  doc4.isPublished = false;
  doc4.status = "draft";
  doc4.remediationNotes = "Administrator decision: unpublished pending owner confirmation of actual property location and title.";
  doc4.locationAuditHistory.push({
    previousCoordinates: doc4.geometry.coordinates,
    newCoordinates: doc4.geometry.coordinates,
    previousLocation: doc4.location,
    newLocation: doc4.location,
    previousTitle: doc4.title,
    newTitle: doc4.title,
    remediatedBy: adminUser._id,
    adminUsername: adminUser.username || "demo",
    remediationReason: "Administrator decision: unpublished pending owner confirmation of actual property location and title.",
    timestamp: new Date(),
  });
  await doc4.save();
  executionLog.push({
    id: doc4._id.toString(),
    title: doc4.title,
    decision: "2C — UNPUBLISH / DRAFT",
    isPublishedBefore: d4BeforePub,
    isPublishedAfter: doc4.isPublished,
    coordinates: doc4.geometry.coordinates,
    remediationReviewStatus: doc4.remediationReviewStatus,
    auditReason: "Administrator decision: unpublished pending owner confirmation of actual property location and title.",
    auditEntryAdded: true,
  });

  // DECISION 5 — TEST LISTING "sjs"
  const doc5 = await Listing.findById("6a848373728df9b85f59c2bc");
  assert(doc5, "Listing 5 not found");
  const d5BeforePub = doc5.isPublished;
  doc5.isPublished = false;
  doc5.status = "draft";
  doc5.remediationNotes = "Administrator decision: placeholder/test listing unpublished and retained as draft. No deletion authorized.";
  doc5.locationAuditHistory.push({
    previousCoordinates: doc5.geometry.coordinates,
    newCoordinates: doc5.geometry.coordinates,
    previousLocation: doc5.location,
    newLocation: doc5.location,
    previousTitle: doc5.title,
    newTitle: doc5.title,
    remediatedBy: adminUser._id,
    adminUsername: adminUser.username || "demo",
    remediationReason: "Administrator decision: placeholder/test listing unpublished and retained as draft. No deletion authorized.",
    timestamp: new Date(),
  });
  await doc5.save();
  executionLog.push({
    id: doc5._id.toString(),
    title: doc5.title,
    decision: "3A — UNPUBLISH AS DRAFT",
    isPublishedBefore: d5BeforePub,
    isPublishedAfter: doc5.isPublished,
    coordinates: doc5.geometry.coordinates,
    remediationReviewStatus: doc5.remediationReviewStatus,
    auditReason: "Administrator decision: placeholder/test listing unpublished and retained as draft. No deletion authorized.",
    auditEntryAdded: true,
  });

  // DECISION 6 — TEST LISTING "sjs"
  const doc6 = await Listing.findById("6a8485086210b402d2ab6c8e");
  assert(doc6, "Listing 6 not found");
  const d6BeforePub = doc6.isPublished;
  doc6.isPublished = false;
  doc6.status = "draft";
  doc6.remediationNotes = "Administrator decision: placeholder/test listing unpublished and retained as draft. No deletion authorized.";
  doc6.locationAuditHistory.push({
    previousCoordinates: doc6.geometry.coordinates,
    newCoordinates: doc6.geometry.coordinates,
    previousLocation: doc6.location,
    newLocation: doc6.location,
    previousTitle: doc6.title,
    newTitle: doc6.title,
    remediatedBy: adminUser._id,
    adminUsername: adminUser.username || "demo",
    remediationReason: "Administrator decision: placeholder/test listing unpublished and retained as draft. No deletion authorized.",
    timestamp: new Date(),
  });
  await doc6.save();
  executionLog.push({
    id: doc6._id.toString(),
    title: doc6.title,
    decision: "3A — UNPUBLISH AS DRAFT",
    isPublishedBefore: d6BeforePub,
    isPublishedAfter: doc6.isPublished,
    coordinates: doc6.geometry.coordinates,
    remediationReviewStatus: doc6.remediationReviewStatus,
    auditReason: "Administrator decision: placeholder/test listing unpublished and retained as draft. No deletion authorized.",
    auditEntryAdded: true,
  });

  // Verify total collection counts
  const finalListingCount = await Listing.countDocuments();
  const finalUserCount = await User.countDocuments();
  const finalBookingCount = await Booking.countDocuments();
  const finalReviewCount = await Review.countDocuments();

  assert.strictEqual(finalListingCount, 150, "Listings count must remain 150");
  assert.strictEqual(finalUserCount, 14, "Users count must remain 14");
  assert.strictEqual(finalBookingCount, 5, "Bookings count must remain 5");
  assert.strictEqual(finalReviewCount, 5, "Reviews count must remain 5");

  console.log("\n==================================================================");
  console.log("PHASE 9.3.5 EXECUTION SUCCESSFUL — ALL 6 DECISIONS APPLIED");
  console.log("==================================================================");
  console.log(JSON.stringify(executionLog, null, 2));

  await mongoose.disconnect();
}

executePhase9_3_5().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
