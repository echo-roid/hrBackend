const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');

// Routes
router
  .route('/')
  .get(companyController.getAllCompanies)
  .post(companyController.createCompany);

router
  .route('/search')
  .get(companyController.searchCompanies);

router
  .route('/:id')
  .get(companyController.getCompany)
  .patch(companyController.updateCompany)
  .delete(companyController.deleteCompany);

module.exports = router;