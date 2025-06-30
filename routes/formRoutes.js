const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');

// Form creation
router.post('/', formController.createForm);

// Get forms by lead ID
router.get('/lead/:leadId', formController.getFormsByLead);

// Get lead forms with submissions
router.get('/lead-submissions/:leadId', formController.getLeadFormsWithSubmissions);

// Get shared form
router.get('/shared/:shareId', formController.getSharedForm);

// Submit form response
router.post('/submit', formController.submitFormResponse);

// Get form submissions
router.get('/:formId/submissions', formController.getFormSubmissions);

router.put('/:formId', formController.updateForm);

module.exports = router;