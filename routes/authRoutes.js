const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const User = require('../models/User');
const { authLimiter } = require('../middleware/rateLimiter');
const tokenStore = require('../models/RefreshToken'); // استيراد موديل التوكنات
const { verifyToken } = require('../middleware/jwtMiddleware');

router.use((req, res, next) => {
  req.userModel = new User(req.app.get('opensearchClient'));
  next();
});

// Apply rate limiter only here
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/profile', verifyToken, (req, res) => {
  res.json({ message: 'مرحبا بك في صفحتك الشخصية', user: req.user });
});


module.exports = router;
