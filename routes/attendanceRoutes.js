const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const attendanceController = require('../controllers/attendanceController');

// Configure file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Routes
router.post('/check-in', upload.single('photo'), attendanceController.checkIn);
router.post('/check-out', upload.single('photo'), attendanceController.checkOut);
// Get attendance records
router.get('/', attendanceController.getAttendanceRecords);

// Get employee attendance
router.get('/employee/:employeeId', attendanceController.getEmployeeAttendance);

// Get team attendance
router.get('/team/:teamName', attendanceController.getTeamAttendance);
// In your routes file
router.get('/today-present-by-team', attendanceController.getTodayPresentEmployeesByTeam);

router.get('/summary', attendanceController.getAttendanceSummary);
router.get('/summary_all', attendanceController.getAttendanceSummaryAll);
module.exports = router;