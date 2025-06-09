const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');

const multer = require('multer');

// For handling multipart/form-data without files
const upload = multer();

// Add holiday/event
router.post('/', upload.none(), calendarController.addEvent);

// List all events (with optional month/year filtering)
router.get('/', calendarController.listEvents);


router.delete('/delete/:id', calendarController.deleteEvent);

router.get('/meetings', calendarController.getMeetingsByOrganizer); 
module.exports = router;