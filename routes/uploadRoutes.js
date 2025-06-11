const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();

// Configure storage for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Folder to save uploads
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Upload endpoint
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Send back the file URL or path
  const fileUrl = `hrbackend-production-34b4.up.railway.app/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

module.exports = router;
