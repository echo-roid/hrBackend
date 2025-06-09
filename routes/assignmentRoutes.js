const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');

// POST /api/assignments - Create new assignment
router.post('/', assignmentController.createAssignment);

// PUT /api/assignments/:id/time - Update time spent
router.put('/:id/time', assignmentController.updateTimeSpent);

// GET /api/assignments - Get all assignments (optional filters)
router.get('/', assignmentController.getAllAssignments);

module.exports = router;