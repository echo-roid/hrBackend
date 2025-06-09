const express = require('express');
const router = express.Router();
const controller = require('../controllers/reimbursementController');

// Create reimbursement
router.post('/', controller.createReimbursement);

// Get all reimbursements
router.get('/', controller.getAllReimbursements);
// New route to get reimbursements by employee ID
router.get('/rei/:employeeId', controller.getReimbursementsByEmployeeId);
router.get('/notifications/:role/:userId', controller.getUserNotifications);


// Update status
router.put('/rei/:id/status', controller.updateReimbursementStatus);

module.exports = router;
