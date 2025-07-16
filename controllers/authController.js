const jwt = require('jsonwebtoken');
const User = require('../models/User');
const refreshTokenStore = require('../models/RefreshToken');
const { v4: uuidv4 } = require('uuid');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and username are required'
      });
    }

    // Password and email validation is now handled in the User model

    const existingUser = await req.userModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await req.userModel.create({ email, password, username });
    const { accessToken, refreshToken } = generateTokens(user.id);
    refreshTokenStore.create(
      user.id,
      refreshToken,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    );

    res.status(201).json({ 
      user: { id: user.id, email: user.email, username: user.username },
      accessToken,
      refreshToken
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await req.userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const isValidPassword = await req.userModel.validatePassword(user, password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    
    refreshTokenStore.create(
      user.id,
      refreshToken,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      accessToken,
      refreshToken
    });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const tokenData = refreshTokenStore.findByToken(refreshToken);
    if (!tokenData) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const user = await req.userModel.findById(tokenData.userId);
    if (!user) {
      refreshTokenStore.deleteByToken(refreshToken);
      return res.status(401).json({ message: 'User not found' });
    }

    const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });

    res.json({ accessToken });
  } catch (error) {
    res.status(500).json({ message: 'Error refreshing token', error: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    refreshTokenStore.deleteByToken(refreshToken);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error logging out', error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await req.userModel.findByEmail(email);
    if (!user) {
      // For security, don't reveal that the email doesn't exist
      return res.status(200).json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    // Generate password reset token
    const resetToken = uuidv4();
    const resetTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Save reset token to user
    await req.userModel.updateResetToken(user.id, resetToken, resetTokenExpiry);

    // In a real application, send email with reset link
    // For now, just return the token
    res.status(200).json({
      success: true,
      message: 'Password reset instructions sent',
      resetToken // In production, this should be sent via email instead
    });
  } catch (error) {
    res.status(500).json({ message: 'Error processing password reset', error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    // Validate password strength in User model
    if (!req.userModel.validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and contain at least one number, one uppercase letter, and one special character'
      });
    }

    const user = await req.userModel.findByResetToken(token);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password and clear reset token
    await req.userModel.updatePassword(user.id, newPassword);

    // Invalidate all refresh tokens for this user
    await refreshTokenStore.deleteAllForUser(user.id);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password', error: error.message });
  }
};
