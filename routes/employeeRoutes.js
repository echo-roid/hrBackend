const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const employeeController = require('../controllers/employeeController');

// Upload photo and create employee
router.post('/', upload.single('photo'), employeeController.createEmployee);
router.put('/employees/:id', upload.single('photo'), employeeController.editEmployee);
// Get all employees
router.get('/', employeeController.getAllEmployees);

router.get('/allmanagers', employeeController.getAllManagers);


// Get employee by ID with full data
router.get('/:id', employeeController.getEmployeeById);

router.delete('/:id', employeeController.deleteEmployee);

// For soft deletion (alternative)
router.patch('/:id/deactivate', employeeController.softDeleteEmployee);



module.exports = router;
