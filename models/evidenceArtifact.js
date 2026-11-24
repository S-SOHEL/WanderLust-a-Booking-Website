/**
 * WanderLust Evidence Artifact Model
 * Path: models/evidenceArtifact.js
 * 
 * Persistent Mongoose model for property verification evidence artifacts.
 * Stores document metadata, SHA-256 integrity checksums, encryption identifiers,
 * verification audit trail, revocation status, and access history.
 * 
 * PRIVACY GUARANTEES:
 * - Raw document bytes are NEVER stored in MongoDB or public listing models.
 * - Files are stored encrypted at rest in the private evidence vault.
 * - Access is strictly restricted to authenticated administrators with verified 2FA.
 */

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ALLOWED_DIMENSIONS = [
  "PROPERTY_EXISTENCE",
  "HOST_AUTHORITY",
  "RATE",
  "COORDINATE",
  "IMAGE_PERMISSION",
  "EDITORIAL",
];

const ALLOWED_STATUSES = [
  "PENDING_REVIEW",
  "AUTHENTIC_VERIFIED",
  "REJECTED_AUDIT_FAILURE",
  "REVOKED",
];

const evidenceArtifactSchema = new Schema({
  evidenceReferenceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  sourceReference: {
    type: String,
    trim: true,
    default: "",
    index: true,
  },
  verificationDimension: {
    type: String,
    required: true,
    enum: ALLOWED_DIMENSIONS,
    index: true,
  },
  evidenceType: {
    type: String,
    required: true,
    trim: true,
  },
  secureStorageKey: {
    type: String,
    required: true,
    trim: true,
  },
  sha256Checksum: {
    type: String,
    required: true,
    trim: true,
  },
  fileMetadata: {
    originalFilename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  verificationStatus: {
    type: String,
    enum: ALLOWED_STATUSES,
    default: "PENDING_REVIEW",
    index: true,
  },
  verifiedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  verificationTimestamp: {
    type: Date,
    default: null,
  },
  verificationNotes: {
    type: String,
    default: "",
    trim: true,
  },
  revocationStatus: {
    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, default: "", trim: true },
  },
  accessAuditLog: [
    {
      accessedBy: { type: Schema.Types.ObjectId, ref: "User" },
      accessType: {
        type: String,
        enum: ["UPLOAD", "VIEW", "DOWNLOAD", "VERIFY", "REJECT", "REVOKE", "INTEGRITY_CHECK"],
        required: true,
      },
      ipAddress: { type: String, default: "127.0.0.1" },
      result: {
        type: String,
        enum: ["SUCCESS", "CHECKSUM_MISMATCH", "TAMPER_DETECTED", "DENIED", "STORAGE_PAYLOAD_MISSING"],
        default: "SUCCESS",
      },
      timestamp: { type: Date, default: Date.now },
      details: { type: String, default: "" },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp automatically on save
evidenceArtifactSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Compound index for efficient dimension lookups
evidenceArtifactSchema.index({ verificationDimension: 1, verificationStatus: 1 });

const EvidenceArtifact = mongoose.model("EvidenceArtifact", evidenceArtifactSchema);

module.exports = {
  EvidenceArtifact,
  ALLOWED_DIMENSIONS,
  ALLOWED_STATUSES,
};
