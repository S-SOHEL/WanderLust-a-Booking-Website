const https = require("https");

/**
 * Verifies a Cloudflare Turnstile response token against Cloudflare's siteverify endpoint.
 * Gracefully bypassed if TURNSTILE_SECRET_KEY is not set in the environment.
 */
async function verifyTurnstile(token, remoteIp) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SECRET_KEY.trim() : null;

  // Graceful fallback: If Turnstile is not configured, permit login
  if (!secretKey) {
    return { success: true, bypassed: true };
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    return {
      success: false,
      error: "Please complete the anti-bot verification challenge.",
    };
  }

  return new Promise((resolve) => {
    const postData = new URLSearchParams({
      secret: secretKey,
      response: token.trim(),
      ...(remoteIp ? { remoteip: remoteIp } : {}),
    }).toString();

    const options = {
      hostname: "challenges.cloudflare.com",
      port: 443,
      path: "/turnstile/v0/siteverify",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (data.success) {
            resolve({ success: true });
          } else {
            console.warn("[Turnstile] Verification failed:", data["error-codes"]);
            resolve({
              success: false,
              error: "Security verification challenge failed. Please refresh and try again.",
            });
          }
        } catch (e) {
          console.error("[Turnstile] Response parse error:", e.message);
          resolve({ success: false, error: "Security challenge service error." });
        }
      });
    });

    req.on("error", (err) => {
      console.error("[Turnstile] Request error:", err.message);
      // In case of network glitch reaching Cloudflare, do not completely lock out admin if fallback permitted
      resolve({ success: false, error: "Could not reach security verification service. Please try again." });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: "Security challenge request timed out." });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = { verifyTurnstile };
