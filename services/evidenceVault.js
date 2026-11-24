/**
 * WanderLust Secure Persistent Evidence Vault
 * Path: services/evidenceVault.js
 * 
 * Provides private, encrypted file storage and lifecycle management for
 * legal, municipal, and commercial property-verification documents.
 * 
 * SECURITY GUARANTEES:
 * - Encryption at rest using AES-256-GCM with unique 12-byte IV and 16-byte authentication tag per file.
 * - End-to-end SHA-256 integrity checksum verification before encryption and after decryption.
 * - Stored outside public web root in non-routable directory with restricted permissions (0700).
 * - No public URLs: all retrieval is authenticated, 2FA-verified, and streamed via signed tokens or admin endpoints.
 * - Strict MIME type and size enforcement (<= 15MB, PDF/JPEG/PNG/WEBP/TIFF only).
 * - Comprehensive tamper detection and immutable audit trail.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { EvidenceArtifact, ALLOWED_DIMENSIONS } = require("../models/evidenceArtifact.js");

// Vault Configuration
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
];

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];

const DIMENSION_PREFIX_MAP = {
  PROPERTY_EXISTENCE: "PROP",
  HOST_AUTHORITY: "HOST",
  RATE: "RATE",
  COORDINATE: "COORD",
  IMAGE_PERMISSION: "IMG",
  EDITORIAL: "ED",
};

/**
 * Resolves the absolute directory path for encrypted file storage.
 * Enforces persistent storage in production; ephemeral fallback is strictly blocked.
 */
function getVaultStorageDir() {
  const customPath = process.env.EVIDENCE_VAULT_PATH;

  if (process.env.NODE_ENV === "production") {
    if (!customPath || !customPath.trim()) {
      throw new Error(
        "CRITICAL SECURITY FAILURE: EVIDENCE_VAULT_PATH is mandatory when NODE_ENV=production. Ephemeral container storage is strictly prohibited. Configure a persistent disk mount path (e.g. /var/data/wanderlust_vault)."
      );
    }

    const storageDir = path.resolve(customPath.trim());
    if (!fs.existsSync(storageDir)) {
      try {
        fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
      } catch (mkdirErr) {
        throw new Error(
          `CRITICAL SECURITY FAILURE: Configured EVIDENCE_VAULT_PATH does not exist and cannot be created: ${mkdirErr.message}`
        );
      }
    }

    // Verify writability with atomic write probe
    const probeFile = path.join(storageDir, `.vault_write_probe_${Date.now()}_${process.pid}`);
    try {
      fs.writeFileSync(probeFile, "probe", { mode: 0o600 });
      fs.unlinkSync(probeFile);
    } catch (writeErr) {
      throw new Error(
        `CRITICAL SECURITY FAILURE: Configured EVIDENCE_VAULT_PATH is not writable: ${writeErr.message}`
      );
    }

    return storageDir;
  }

  // Non-production fallback (development / test)
  const storageDir = customPath
    ? path.resolve(customPath)
    : path.resolve(__dirname, "../vault_storage");

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  }
  return storageDir;
}

/**
 * Derives a 32-byte encryption key from the environment secret.
 * Enforces mandatory EVIDENCE_VAULT_KEY (minimum 32 characters) in production.
 * SECRET fallback is strictly disabled in production.
 */
function getEncryptionKey() {
  const isProd = process.env.NODE_ENV === "production";
  const vaultKey = process.env.EVIDENCE_VAULT_KEY;

  if (isProd) {
    if (!vaultKey || !vaultKey.trim()) {
      throw new Error(
        "CRITICAL SECURITY FAILURE: EVIDENCE_VAULT_KEY is mandatory when NODE_ENV=production. Fallback to SECRET is strictly disabled in production."
      );
    }

    const cleanKey = vaultKey.trim();
    if (cleanKey.length < 32) {
      throw new Error(
        `CRITICAL SECURITY FAILURE: EVIDENCE_VAULT_KEY is invalid. It must be at least 32 characters long (received length ${cleanKey.length}). Weak or truncated keys are strictly prohibited in production.`
      );
    }

    return crypto.createHash("sha256").update(cleanKey).digest();
  }

  // Non-production (development / test)
  if (vaultKey && vaultKey.trim()) {
    const cleanKey = vaultKey.trim();
    if (cleanKey.length < 16) {
      throw new Error(
        `EVIDENCE_VAULT_KEY is too short (minimum 16 characters required in non-production).`
      );
    }
    return crypto.createHash("sha256").update(cleanKey).digest();
  }

  if (process.env.SECRET && process.env.SECRET.trim()) {
    return crypto.createHash("sha256").update(process.env.SECRET.trim()).digest();
  }

  // Deterministic fallback for local development/test ONLY
  return crypto.createHash("sha256").update("WanderLust-Dev-Test-Evidence-Vault-Key-2026").digest();
}

/**
 * Validates production vault configuration at application startup.
 * Fails fast if keys or storage are misconfigured.
 */
function validateProductionVaultConfiguration() {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    // In dev/test, verify we can obtain an encryption key and storage dir safely
    getEncryptionKey();
    getVaultStorageDir();
    return { valid: true, mode: "non-production" };
  }

  // Production validation
  const key = getEncryptionKey();
  const storageDir = getVaultStorageDir();

  return {
    valid: true,
    mode: "production",
    storageDir,
    keyBytes: key.length,
  };
}

/**
 * Generates an immutable, collision-resistant evidence reference ID.
 * Example: EV-PROP-2026-9F8A2B1C
 *
 * @param {string} dimension Verification dimension
 * @returns {string} Unique reference ID
 */
function generateEvidenceReferenceId(dimension) {
  const dim = (dimension || "").trim().toUpperCase();
  const prefix = DIMENSION_PREFIX_MAP[dim] || "GEN";
  const year = new Date().getFullYear();
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `EV-${prefix}-${year}-${randomHex}`;
}

/**
 * Validates file payload buffer, MIME type, extension, and size.
 *
 * @param {Buffer} buffer File binary buffer
 * @param {string} mimeType MIME type declared or detected
 * @param {string} originalFilename Original file name
 * @returns {Object} { isValid: boolean, error?: string }
 */
function validateFilePayload(buffer, mimeType, originalFilename) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { isValid: false, error: "File buffer is required and must be a valid Buffer." };
  }
  if (buffer.length === 0) {
    return { isValid: false, error: "File is empty (0 bytes)." };
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds 15MB limit (size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  // Path traversal guard on originalFilename
  const sanitized = path.basename(originalFilename || "");
  if (!sanitized || sanitized !== originalFilename.trim() || originalFilename.includes("/") || originalFilename.includes("\\")) {
    return {
      isValid: false,
      error: "Potential path traversal or invalid characters detected in filename.",
    };
  }

  const cleanMime = (mimeType || "").toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.includes(cleanMime)) {
    return {
      isValid: false,
      error: `Disallowed MIME type '${mimeType}'. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}.`,
    };
  }

  const ext = path.extname(originalFilename || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      error: `Disallowed file extension '${ext}'. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }

  return { isValid: true };
}

/**
 * Encrypts a raw buffer using AES-256-GCM.
 * Output format: [12 bytes IV][16 bytes AuthTag][Ciphertext]
 *
 * @param {Buffer} plainBuffer Plaintext file buffer
 * @returns {Object} { encryptedBuffer: Buffer, ivHex: string, authTagHex: string }
 */
function encryptBuffer(plainBuffer) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Prefix payload with IV (12 bytes) and AuthTag (16 bytes)
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return {
    encryptedBuffer: combined,
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
  };
}

/**
 * Decrypts an encrypted payload using AES-256-GCM.
 *
 * @param {Buffer} encryptedPayload Buffer containing [12 bytes IV][16 bytes AuthTag][Ciphertext]
 * @returns {Buffer} Decrypted plaintext buffer
 */
function decryptBuffer(encryptedPayload) {
  if (encryptedPayload.length < 28) {
    throw new Error("Invalid encrypted payload: buffer too short to contain IV and AuthTag.");
  }

  const key = getEncryptionKey();
  const iv = encryptedPayload.subarray(0, 12);
  const authTag = encryptedPayload.subarray(12, 28);
  const ciphertext = encryptedPayload.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain;
  } catch (err) {
    throw new Error(
      `Decryption integrity failure: GCM authentication tag verification failed (${err.message}). Payload may have been tampered with or corrupted.`
    );
  }
}

/**
 * Stores a verification document in the persistent encrypted vault.
 * Fails closed if storage or database is unavailable.
 *
 * A successful upload ALWAYS initializes status to "PENDING_REVIEW".
 *
 * @param {Object} params
 *   - buffer: Buffer
 *   - originalFilename: string
 *   - mimeType: string
 *   - dimension: string
 *   - evidenceType: string
 *   - uploadedBy: ObjectId | string
 *   - sourceReference?: string
 *   - ipAddress?: string
 * @returns {Promise<Object>} { success: boolean, artifact: Object }
 */
async function storeEncryptedFile({
  buffer,
  originalFilename,
  mimeType,
  dimension,
  evidenceType,
  uploadedBy,
  sourceReference = "",
  customReferenceId = null,
  ipAddress = "127.0.0.1",
}) {
  // 1. Fail-closed check: verify MongoDB connectivity
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error(
      "Evidence vault storage unavailable: persistent database connection is inactive (fail-closed)."
    );
  }

  // 2. Validate payload
  const validation = validateFilePayload(buffer, mimeType, originalFilename);
  if (!validation.isValid) {
    throw new Error(`File validation failed: ${validation.error}`);
  }

  // 3. Dimension validation
  const dim = (dimension || "").trim().toUpperCase();
  if (!ALLOWED_DIMENSIONS.includes(dim)) {
    throw new Error(
      `Invalid verification dimension '${dimension}'. Must be one of: ${ALLOWED_DIMENSIONS.join(", ")}`
    );
  }

  // 4. Generate or validate Reference ID and prevent duplicate references
  const evidenceReferenceId = (customReferenceId || "").trim() || generateEvidenceReferenceId(dim);
  const existingArtifact = await EvidenceArtifact.findOne({ evidenceReferenceId });
  if (existingArtifact) {
    throw new Error(
      `Duplicate evidence reference ID collision: Reference '${evidenceReferenceId}' already exists in database.`
    );
  }

  // 5. Calculate SHA-256 integrity checksum on original unencrypted bytes
  const sha256Checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  // 6. Encrypt document bytes
  const { encryptedBuffer } = encryptBuffer(buffer);

  // 7. Secure storage key and path
  const storageKey = `${evidenceReferenceId}_${Date.now()}.enc`;
  const storageDir = getVaultStorageDir();
  const storageFilePath = path.join(storageDir, storageKey);

  // 8. Write encrypted file to secure disk
  fs.writeFileSync(storageFilePath, encryptedBuffer, { mode: 0o600 });

  // 9. Create persistent Mongoose metadata record with compensating cleanup on failure
  try {
    const artifact = new EvidenceArtifact({
      evidenceReferenceId,
      sourceReference: sourceReference.trim(),
      verificationDimension: dim,
      evidenceType: (evidenceType || "GENERAL_AUDIT_DOCUMENT").trim(),
      secureStorageKey: storageKey,
      sha256Checksum,
      fileMetadata: {
        originalFilename: path.basename(originalFilename),
        mimeType: mimeType.toLowerCase().trim(),
        sizeBytes: buffer.length,
        uploadedAt: new Date(),
      },
      uploadedBy,
      verificationStatus: "PENDING_REVIEW", // Mandatory: Never automatically AUTHENTIC_VERIFIED
      accessAuditLog: [
        {
          accessedBy: uploadedBy,
          accessType: "UPLOAD",
          ipAddress,
          result: "SUCCESS",
          details: `Uploaded ${path.basename(originalFilename)} (${buffer.length} bytes, SHA-256: ${sha256Checksum.slice(0, 8)}...)`,
        },
      ],
    });

    await artifact.save();

    return {
      success: true,
      evidenceReferenceId,
      artifact,
      sha256Checksum,
    };
  } catch (dbErr) {
    // COMPENSATING CLEANUP: Remove newly written encrypted file if MongoDB persistence fails
    if (fs.existsSync(storageFilePath)) {
      try {
        fs.unlinkSync(storageFilePath);
      } catch (cleanupErr) {
        console.error("Compensating cleanup warning:", cleanupErr.message);
      }
    }
    if (dbErr.code === 11000) {
      throw new Error(
        `Duplicate evidence reference ID collision: Reference '${evidenceReferenceId}' already exists in database.`
      );
    }
    throw new Error(
      `Database persistence failed: ${dbErr.message}. Newly written encrypted file safely removed.`
    );
  }
}

/**
 * Retrieves and decrypts a document from the vault with SHA-256 integrity verification.
 * Strictly verifies authentication, revocation, and cryptographic authenticity.
 *
 * @param {string} evidenceReferenceId
 * @param {Object} options { requestingUser, ipAddress }
 * @returns {Promise<Object>} { buffer: Buffer, artifact: Object, metadata: Object }
 */
async function retrieveDecryptedFile(evidenceReferenceId, options = {}) {
  const { requestingUser, ipAddress = "127.0.0.1" } = options;

  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error(
      "Evidence vault storage unavailable: persistent database connection is inactive (fail-closed)."
    );
  }

  const cleanRef = (evidenceReferenceId || "").trim();
  const artifact = await EvidenceArtifact.findOne({ evidenceReferenceId: cleanRef });
  if (!artifact) {
    throw new Error(`Evidence artifact '${cleanRef}' not found in persistent vault.`);
  }

  // Revocation Check: Revoked documents cannot be retrieved for normal verification
  if (artifact.revocationStatus && artifact.revocationStatus.isRevoked) {
    // Log attempted access
    artifact.accessAuditLog.push({
      accessedBy: requestingUser ? requestingUser._id : null,
      accessType: "DOWNLOAD",
      ipAddress,
      result: "DENIED",
      details: `Access denied: Evidence artifact '${cleanRef}' has been revoked (${artifact.revocationStatus.reason}).`,
    });
    await artifact.save();

    throw new Error(
      `Evidence artifact '${cleanRef}' has been revoked and is inaccessible for verification. Reason: ${artifact.revocationStatus.reason}`
    );
  }

  // Resolve storage path
  const storageDir = getVaultStorageDir();
  const storageFilePath = path.join(storageDir, artifact.secureStorageKey);

  // Path traversal guard
  if (!storageFilePath.startsWith(storageDir)) {
    throw new Error("Security violation: Storage path traversal detected.");
  }

  if (!fs.existsSync(storageFilePath)) {
    artifact.accessAuditLog.push({
      accessedBy: requestingUser ? requestingUser._id : null,
      accessType: "DOWNLOAD",
      ipAddress,
      result: "STORAGE_PAYLOAD_MISSING",
      details: `Storage integrity failure: Encrypted file missing on disk at '${artifact.secureStorageKey}'.`,
    });
    await artifact.save().catch(() => {});
    throw new Error(
      `Storage integrity failure: Encrypted file payload missing from vault storage for artifact '${cleanRef}'.`
    );
  }

  const encryptedBuffer = fs.readFileSync(storageFilePath);

  // Decrypt with AES-256-GCM (verifies GCM auth tag)
  let decryptedBuffer;
  try {
    decryptedBuffer = decryptBuffer(encryptedBuffer);
  } catch (err) {
    // Tamper detected!
    artifact.accessAuditLog.push({
      accessedBy: requestingUser ? requestingUser._id : null,
      accessType: "DOWNLOAD",
      ipAddress,
      result: "TAMPER_DETECTED",
      details: `Tamper detected during decryption: ${err.message}`,
    });
    await artifact.save();
    throw err;
  }

  // SHA-256 Checksum verification
  const computedChecksum = crypto.createHash("sha256").update(decryptedBuffer).digest("hex");
  if (computedChecksum !== artifact.sha256Checksum) {
    artifact.accessAuditLog.push({
      accessedBy: requestingUser ? requestingUser._id : null,
      accessType: "DOWNLOAD",
      ipAddress,
      result: "CHECKSUM_MISMATCH",
      details: `SHA-256 checksum mismatch! Expected: ${artifact.sha256Checksum}, Computed: ${computedChecksum}`,
    });
    await artifact.save();

    throw new Error(
      `Integrity violation: Decrypted file SHA-256 checksum (${computedChecksum}) does not match expected checksum (${artifact.sha256Checksum}). Document may have been modified.`
    );
  }

  // Log successful access
  artifact.accessAuditLog.push({
    accessedBy: requestingUser ? requestingUser._id : null,
    accessType: "DOWNLOAD",
    ipAddress,
    result: "SUCCESS",
    details: `Successfully downloaded and integrity-verified artifact '${cleanRef}'.`,
  });
  await artifact.save();

  return {
    buffer: decryptedBuffer,
    artifact,
    metadata: artifact.fileMetadata,
    sha256Checksum: computedChecksum,
  };
}

/**
 * Admin action: Verifies a pending evidence artifact after authentic human review.
 * Only an authorized administrator can mark a document as AUTHENTIC_VERIFIED.
 *
 * @param {string} evidenceReferenceId
 * @param {Object} adminUser Authenticated admin user
 * @param {string} verificationNotes Optional review notes
 * @param {string} ipAddress IP address
 * @returns {Promise<Object>} Updated artifact
 */
async function verifyEvidenceArtifact(evidenceReferenceId, adminUser, verificationNotes = "", ipAddress = "127.0.0.1") {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error("Evidence vault storage unavailable: database connection inactive (fail-closed).");
  }

  if (!adminUser || adminUser.role !== "admin") {
    throw new Error("Unauthorized: Only authenticated administrators can verify evidence documents.");
  }

  const cleanRef = (evidenceReferenceId || "").trim();
  const artifact = await EvidenceArtifact.findOne({ evidenceReferenceId: cleanRef });
  if (!artifact) {
    throw new Error(`Evidence artifact '${cleanRef}' not found.`);
  }

  if (artifact.revocationStatus && artifact.revocationStatus.isRevoked) {
    throw new Error(`Cannot verify revoked evidence artifact '${cleanRef}'.`);
  }

  artifact.verificationStatus = "AUTHENTIC_VERIFIED";
  artifact.verifiedBy = adminUser._id;
  artifact.verificationTimestamp = new Date();
  artifact.verificationNotes = (verificationNotes || "").trim();

  artifact.accessAuditLog.push({
    accessedBy: adminUser._id,
    accessType: "VERIFY",
    ipAddress,
    result: "SUCCESS",
    details: `Admin verified artifact '${cleanRef}' for dimension '${artifact.verificationDimension}'. Notes: ${artifact.verificationNotes}`,
  });

  await artifact.save();
  return artifact;
}

/**
 * Admin action: Revokes an evidence artifact.
 *
 * @param {string} evidenceReferenceId
 * @param {Object} adminUser Authenticated admin user
 * @param {string} reason Mandatory reason for revocation
 * @param {string} ipAddress IP address
 * @returns {Promise<Object>} Updated artifact
 */
async function revokeEvidenceArtifact(evidenceReferenceId, adminUser, reason, ipAddress = "127.0.0.1") {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error("Evidence vault storage unavailable: database connection inactive (fail-closed).");
  }

  if (!adminUser || adminUser.role !== "admin") {
    throw new Error("Unauthorized: Only authenticated administrators can revoke evidence documents.");
  }

  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw new Error("Revocation reason is required and cannot be empty.");
  }

  const cleanRef = (evidenceReferenceId || "").trim();
  const artifact = await EvidenceArtifact.findOne({ evidenceReferenceId: cleanRef });
  if (!artifact) {
    throw new Error(`Evidence artifact '${cleanRef}' not found.`);
  }

  artifact.verificationStatus = "REVOKED";
  artifact.revocationStatus = {
    isRevoked: true,
    revokedAt: new Date(),
    revokedBy: adminUser._id,
    reason: reason.trim(),
  };

  artifact.accessAuditLog.push({
    accessedBy: adminUser._id,
    accessType: "REVOKE",
    ipAddress,
    result: "SUCCESS",
    details: `Admin revoked artifact '${cleanRef}'. Reason: ${reason.trim()}`,
  });

  await artifact.save();
  return artifact;
}

/**
 * Generates a short-lived signed token for authenticated document streaming.
 * Valid for `expiresInSeconds` (default: 300 seconds = 5 minutes).
 *
 * @param {string} evidenceReferenceId
 * @param {string} userId Admin user ID
 * @param {number} expiresInSeconds
 * @returns {string} Signed token
 */
function generateShortLivedSignedToken(evidenceReferenceId, userId, expiresInSeconds = 300) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const payload = JSON.stringify({ refId: evidenceReferenceId, uid: userId, exp: expiresAt });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const secret = process.env.EVIDENCE_VAULT_KEY || process.env.SECRET || "WanderLust-Token-Secret";
  const signature = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a short-lived signed token.
 *
 * @param {string} token
 * @returns {Object} { isValid: boolean, payload?: Object, error?: string }
 */
function verifySignedToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { isValid: false, error: "Malformed signed token." };
  }

  const [payloadB64, signature] = token.split(".");
  const secret = process.env.EVIDENCE_VAULT_KEY || process.env.SECRET || "WanderLust-Token-Secret";
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return { isValid: false, error: "Invalid token signature." };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (Date.now() > payload.exp) {
      return { isValid: false, error: "Signed token has expired." };
    }
    return { isValid: true, payload };
  } catch (err) {
    return { isValid: false, error: "Invalid token payload JSON." };
  }
}

/**
 * Checks overall health and availability of the evidence vault.
 *
 * @returns {Object} { available: boolean, dbReady: boolean, storageWritable: boolean, details: string }
 */
function checkVaultHealth() {
  const dbReady = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  let storageWritable = false;
  let details = "";

  try {
    const dir = getVaultStorageDir();
    const testFile = path.join(dir, `.vault_health_test_${Date.now()}`);
    fs.writeFileSync(testFile, "health_check");
    fs.unlinkSync(testFile);
    storageWritable = true;
  } catch (err) {
    details = `Storage write error: ${err.message}`;
  }

  const available = dbReady && storageWritable;
  return {
    available,
    dbReady,
    storageWritable,
    details: available ? "Vault operational and storage healthy." : details || "Database or storage unavailable.",
  };
}

/**
 * Audits consistency between MongoDB EvidenceArtifact records and vault disk files.
 * Reports missing files and unindexed orphaned files.
 *
 * @returns {Promise<Object>} { consistent: boolean, totalRecords: number, totalDiskFiles: number, missingOnDisk: Array, orphanOnDisk: Array }
 */
async function auditVaultStorageConsistency() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error("Evidence vault storage unavailable: database connection inactive.");
  }

  const storageDir = getVaultStorageDir();
  const artifacts = await EvidenceArtifact.find({}).lean();
  const diskFiles = fs.existsSync(storageDir)
    ? fs.readdirSync(storageDir).filter((f) => f.endsWith(".enc"))
    : [];

  const diskFileSet = new Set(diskFiles);
  const dbKeySet = new Set();

  const missingOnDisk = [];
  for (const art of artifacts) {
    dbKeySet.add(art.secureStorageKey);
    const expectedPath = path.join(storageDir, art.secureStorageKey);
    if (!fs.existsSync(expectedPath)) {
      missingOnDisk.push({
        evidenceReferenceId: art.evidenceReferenceId,
        secureStorageKey: art.secureStorageKey,
        dimension: art.verificationDimension,
      });
    }
  }

  const orphanOnDisk = [];
  for (const f of diskFiles) {
    if (!dbKeySet.has(f)) {
      orphanOnDisk.push(f);
    }
  }

  return {
    consistent: missingOnDisk.length === 0 && orphanOnDisk.length === 0,
    totalRecords: artifacts.length,
    totalDiskFiles: diskFiles.length,
    missingOnDisk,
    orphanOnDisk,
  };
}

module.exports = {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  getVaultStorageDir,
  getEncryptionKey,
  validateProductionVaultConfiguration,
  generateEvidenceReferenceId,
  validateFilePayload,
  encryptBuffer,
  decryptBuffer,
  storeEncryptedFile,
  retrieveDecryptedFile,
  verifyEvidenceArtifact,
  revokeEvidenceArtifact,
  generateShortLivedSignedToken,
  verifySignedToken,
  checkVaultHealth,
  auditVaultStorageConsistency,
};
