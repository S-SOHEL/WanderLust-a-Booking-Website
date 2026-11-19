const crypto = require("crypto");
const { generateSecret, verifySync, generateURI } = require("otplib");
const qrcode = require("qrcode");

/**
 * Derives a 32-byte key from environment secret for AES-256-GCM
 */
function getDerivedKey() {
  const masterSecret =
    process.env.ADMIN_2FA_ENCRYPTION_KEY ||
    process.env.SECRET ||
    "wanderlust-fallback-2fa-encryption-key-minimum-32-chars";
  return crypto.createHash("sha256").update(masterSecret).digest();
}

/**
 * Encrypts a plain secret string using AES-256-GCM
 * Returns "ivHex:tagHex:encryptedHex"
 */
function encryptSecret(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getDerivedKey(), iv);
  let encrypted = cipher.update(String(plainText), "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted payload
 */
function decryptSecret(encryptedPayload) {
  if (!encryptedPayload || !encryptedPayload.includes(":")) return null;
  try {
    const [ivHex, tagHex, encHex] = encryptedPayload.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getDerivedKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let decrypted = decipher.update(encHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[TwoFactor] Secret decryption failure:", err.message);
    return null;
  }
}

/**
 * Generates a new Base32 secret for TOTP
 */
function createSecret() {
  return generateSecret();
}

/**
 * Verifies a 6-digit TOTP token against a plain Base32 secret
 * Allows 35 seconds of clock drift (epochTolerance: 35)
 */
function verifyTOTP(token, plainSecret) {
  if (!token || !plainSecret) return false;
  const cleanToken = String(token).replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;
  try {
    const result = verifySync({
      token: cleanToken,
      secret: plainSecret,
      epochTolerance: 35,
    });
    return !!(result && result.valid);
  } catch (err) {
    console.error("[TwoFactor] TOTP check error:", err.message);
    return false;
  }
}

/**
 * Generates an otpauth:// URI compatible with Google Authenticator, Microsoft Authenticator, and Aegis
 */
function generateTOTPUri(accountEmail, plainSecret) {
  return generateURI({
    label: `WanderLust Admin (${accountEmail})`,
    issuer: "WanderLust",
    secret: plainSecret,
  });
}

/**
 * Generates a Data URL QR Code from an otpauth URI
 */
function generateQRCodeDataURL(otpauthUri) {
  return new Promise((resolve, reject) => {
    qrcode.toDataURL(otpauthUri, { margin: 2, scale: 7 }, (err, url) => {
      if (err) return reject(err);
      resolve(url);
    });
  });
}

/**
 * Hashes a recovery code using SHA-256
 */
function hashRecoveryCode(code) {
  const clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(clean).digest("hex");
}

/**
 * Generates 8 one-time recovery codes
 * Format: WNDR-XXXX-XXXX
 */
function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const plain = `WNDR-${part1}-${part2}`;
    codes.push({
      plain,
      codeHash: hashRecoveryCode(plain),
      used: false,
      usedAt: null,
    });
  }
  return codes;
}

/**
 * Validates and consumes a recovery code from the user's recoveryCodes list
 * Returns index of matched unused code, or -1 if invalid
 */
function findAndValidateRecoveryCode(inputCode, recoveryCodes) {
  if (!inputCode || !Array.isArray(recoveryCodes)) return -1;
  const targetHash = hashRecoveryCode(inputCode);
  return recoveryCodes.findIndex(
    (item) => item.codeHash === targetHash && !item.used
  );
}

module.exports = {
  encryptSecret,
  decryptSecret,
  createSecret,
  verifyTOTP,
  generateTOTPUri,
  generateQRCodeDataURL,
  hashRecoveryCode,
  generateRecoveryCodes,
  findAndValidateRecoveryCode,
};
