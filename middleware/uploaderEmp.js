const multer = require('multer');
const path = require('path');

// Set storage path and naming convention

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${file.fieldname}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit per file
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'Aadhar', maxCount: 1 }, // Front Aadhar
  { name: 'AadharBack', maxCount: 1 }, // Back Aadhar
  { name: 'passportFront', maxCount: 1 },
  { name: 'passportBack', maxCount: 1 },
  { name: 'edu10th', maxCount: 1 },
  { name: 'edu12th', maxCount: 1 },
  { name: 'graduation', maxCount: 1 },
  { name: 'diploma', maxCount: 1 },
  { name: 'panDocument', maxCount: 1 },
  { name: 'cancelCheque', maxCount: 1 },
  { name: 'uanDocument', maxCount: 1 },
]);


module.exports = upload;
