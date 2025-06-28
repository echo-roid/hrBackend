const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

router.get('/', leadController.getLeads);
router.post('/', leadController.createLead); // Multer handles multipart
router.put('/:id', leadController.updateLead);
router.delete('/:id', leadController.deleteLead);
router.patch('/:id/status', leadController.updateRfqStatus);
router.get('/won', leadController.getWonLeads);


module.exports = router;