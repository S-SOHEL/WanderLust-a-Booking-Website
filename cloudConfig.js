const multer = require("multer");
const path = require("path");
const fs = require("fs");

let storage;
let cloudinary = null;

const hasCloudinary =
  process.env.CLOUD_NAME &&
  process.env.CLOUD_API_KEY &&
  process.env.CLOUD_API_SECRET &&
  process.env.CLOUD_NAME !== "your_cloudinary_cloud_name";

if (hasCloudinary) {
  try {
    cloudinary = require("cloudinary").v2;
    const { CloudinaryStorage } = require("multer-storage-cloudinary");

    cloudinary.config({
      cloud_name: process.env.CLOUD_NAME,
      api_key: process.env.CLOUD_API_KEY,
      api_secret: process.env.CLOUD_API_SECRET,
    });

    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder:
          process.env.CLOUDINARY_FOLDER ||
          (process.env.NODE_ENV === "production" ? "wanderlust_PROD" : "wanderlust_DEV"),
        allowed_formats: ["png", "jpg", "jpeg", "webp"],
      },
    });
  } catch (err) {
    console.warn("Cloudinary configuration fallback triggered:", err.message);
  }
}

// Fallback to local disk storage if Cloudinary is not configured
if (!storage) {
  const uploadDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, "listing-" + uniqueSuffix + ext);
    },
  });
}

// File filter: accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif/;
  const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mime = allowedTypes.test(file.mimetype);

  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (.jpg, .jpeg, .png, .webp) are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
  fileFilter: fileFilter,
});

module.exports = {
  cloudinary,
  storage,
  upload,
};
