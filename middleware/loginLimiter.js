const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per window
  message: {
    success: false,
    error: 'Too many login attempts, please try again after 15 minutes'
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = loginLimiter;