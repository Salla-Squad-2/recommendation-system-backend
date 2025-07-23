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
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: yourpassword
 *               username:
 *                 type: string
 *                 example: johndoe
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         description: Missing required fields or email already registered
 *       500:
 *         description: Server error during registration
 */
router.post('/register', authLimiter, authController.register);
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: yourpassword
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   description: User data without password
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         description: Email and password are required
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Server error during login
 */

router.post('/login', authLimiter, authController.login);
/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using a valid refresh token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       description: Refresh token to generate a new access token
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: New access token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       401:
 *         description: Invalid refresh token or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid refresh token
 *       500:
 *         description: Server error while refreshing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Error refreshing token
 *                 error:
 *                   type: string
 *                   example: Detailed error message here
 */
router.post('/refresh', authController.refresh);
/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out by deleting the refresh token
 *     tags:
 *       - Authentication
 *     requestBody:
 *       description: Refresh token to be deleted on logout
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Logout successful, token deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       500:
 *         description: Server error during logout
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Error logging out
 *                 error:
 *                   type: string
 *                   example: Detailed error message here
 */

router.post('/logout', authController.logout);
/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Request password reset link by email
 *     description: Send a reset token to the user's email if the email is registered.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Reset instructions sent or generic success message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 resetToken:
 *                   type: string
 *                   description: Token used for password reset (usually sent by email)
 *                   example: abc123resetToken
 *       400:
 *         description: Email is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Email is required
 *       500:
 *         description: Server error when storing reset token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Failed to store reset token
 */

router.post('/forgot-password', authController.forgotPassword);
/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Reset user password using a valid reset token
 *     description: >
 *       Allows the user to reset their password by providing a valid reset token and a new password.
 *       The new password must meet strength requirements.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token sent to user's email
 *                 example: abc123resetToken
 *               newPassword:
 *                 type: string
 *                 description: New password that must meet complexity rules
 *                 example: NewPassw0rd!
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Password has been reset successfully
 *       400:
 *         description: Invalid input or expired/invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Reset token has expired
 *       500:
 *         description: Server error while resetting password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Error resetting password
 */

router.post('/reset-password', authController.resetPassword);

// صفحة البروفايل للمستخدمين المسجلين فقط
router.get('/profile', verifyToken, (req, res) => {
  res.json({ message: 'مرحبا بك في صفحتك الشخصية', user: req.user });
});

module.exports = router;