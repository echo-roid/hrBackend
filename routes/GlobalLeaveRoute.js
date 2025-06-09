// routes/leaveSettings.js
const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/GlobalLeaveSetting');

router.get('/', leaveController.getLeaveSettings);
router.post('/', leaveController.saveLeaveSettings);
router.get('/active', leaveController.getActiveLeaveTypes);

module.exports = router;