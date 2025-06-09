const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
// const authMiddleware = require('../middlewares/authMiddleware');

// Employee leave info
router.get('/employee/:employeeId', leaveController.getEmployeeLeaveInfo);

// Create leave request
router.post('/request/:employeeId', leaveController.createLeaveRequest);

// Approve leave (manager only)
router.put('/approve/:leaveId', leaveController.approveLeaveRequest);

// Reject leave (manager only)
router.put('/rejectleave/:leaveId', leaveController.rejectLeaveRequest);

// Get employee leave history
router.get('/history/:employeeId', leaveController.getEmployeeLeaves);

// Get all leaves (admin only)
router.get('/all', leaveController.getAllLeaves);

// Get manager notifications
router.get('/notifications/:managerId', leaveController.getManagerNotifications);

module.exports = router;