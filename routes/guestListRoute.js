const express = require('express');
const router = express.Router();
const guestListController = require('../controllers/guestListController');

// Upload guest list
router.post('/leads/:leadId/guestlist', guestListController.uploadGuestList);

// Fetch guest list by lead
router.get('/leads/:leadId/guestlist', guestListController.getGuestListByLead);

module.exports = router;
