const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const aiController = require("../controller/ai.js");

// POST /api/ai/chat
router.post("/chat", wrapAsync(aiController.chat));

module.exports = router;
