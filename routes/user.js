const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const passport = require("passport");
const { saveRedirectUrl, isLoggedIn } = require("../middleware.js");
const userController = require("../controller/users.js");
const { upload } = require("../cloudConfig.js");

router
  .route("/signup")
  .get(userController.renderSignupForm)
  .post(wrapAsync(userController.signup));

router
  .route("/login")
  .get(userController.renderLoginForm)
  .post(
    saveRedirectUrl,
    passport.authenticate("local", {
      failureFlash: true,
      failureRedirect: "/login",
    }),
    userController.login
  );

router.get("/logout", userController.logout);

// User Profile Dashboard
router
  .route("/profile")
  .get(isLoggedIn, wrapAsync(userController.profile))
  .put(isLoggedIn, upload.single("profileImage"), wrapAsync(userController.updateProfile));

router.post("/profile/change-password", isLoggedIn, wrapAsync(userController.changePassword));

module.exports = router;
