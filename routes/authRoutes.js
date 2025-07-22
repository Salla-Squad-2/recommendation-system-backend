const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const User = require('../models/User');
const { authLimiter } = require('../middleware/rateLimiter');
const tokenStore = require('../models/RefreshToken');
const { verifyToken } = require('../middleware/jwtMiddleware');
const { checkRole } = require('../middleware/rbacMiddleware');

router.use((req, res, next) => {
req.userModel = new User();
  next();
});

// ⛔ هذه الصفحة محمية فقط للأدمن
router.get('/history', verifyToken, checkRole(['admin']), (req, res) => {
  res.json({ message: 'مرحبا بك في صفحة التاريخ', user: req.user });
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// 🔐 صفحة البروفايل للمستخدمين المسجلين فقط
router.get('/profile', verifyToken, (req, res) => {
  res.json({ message: 'مرحبا بك في صفحتك الشخصية', user: req.user });
});

module.exports = router;