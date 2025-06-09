const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const loginLimiter = require('../middleware/loginLimiter');
const verifyJWT = require('../middleware/verifyJWT');

// Public routes (no authentication required)
router.post('/login', loginLimiter, authController.login);

// Protected routes (require valid JWT)
router.use(verifyJWT); // All routes after this will require authentication
router.get('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);

module.exports = router;