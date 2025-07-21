const jwt = require('jsonwebtoken');
const User = require('../models/User');
const tokenStore = require('../models/RefreshToken');  // هنا غيرت الاسم من refreshTokenStore إلى tokenStore
const { v4: uuidv4 } = require('uuid');
const { generateAccessToken, generateRefreshToken, generateTokens } = require('../middleware/jwtMiddleware');

const SECRET = process.env.JWT_SECRET;
console.log('tokenStore object:', tokenStore);
console.log('tokenStore.create:', tokenStore.create);
// تسجيل مستخدم جديد
exports.register = async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and username are required'
      });
    }

    const existingUser = await req.userModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await req.userModel.create({ email, password, username });

    const { accessToken, refreshToken } = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role || 'user'
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // إنشاء refresh token مع تحديد النوع "refresh"
    tokenStore.create(user.id, refreshToken, 'refresh', expiresAt, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to store the token' });
      }

      res.status(201).json({ 
        user: { id: user.id, email: user.email, username: user.username },
        accessToken,
        refreshToken
      });
    });

  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

// تسجيل الدخول
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

    const { accessToken, refreshToken } = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role || 'user'
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    tokenStore.create(user.id, refreshToken, 'refresh', expiresAt, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to store the token' });
      }

      const { password: _, ...userWithoutPassword } = user;

      res.json({
        user: userWithoutPassword,
        accessToken,
        refreshToken
      });
    });

  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};

// تجديد التوكن
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    tokenStore.findByToken(refreshToken, 'refresh', async (err, tokenData) => {
      if (err || !tokenData) {
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      const user = await req.userModel.findById(tokenData.user_id);
      if (!user) {
        tokenStore.deleteByToken(refreshToken, 'refresh', () => {});
        return res.status(401).json({ message: 'User not found' });
      }

      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role || 'user'
      });

      res.json({ accessToken });
    });

  } catch (error) {
    res.status(500).json({ message: 'Error refreshing token', error: error.message });
  }
};

// تسجيل خروج (حذف refresh token)
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    tokenStore.deleteByToken(refreshToken, 'refresh', (err) => {
      if (err) {
        return res.status(500).json({ message: 'Error logging out' });
      }
      res.json({ message: 'Logged out successfully' });
    });

  } catch (error) {
    res.status(500).json({ message: 'Error logging out', error: error.message });
  }
};

// نسيان كلمة المرور - إرسال رابط إعادة تعيين
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
      return res.status(200).json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link'
      });
    }

    const resetToken = uuidv4();
    const resetTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // ساعة واحدة

    // هنا بدل updateResetToken تستخدم create مع النوع "reset"
    tokenStore.create(user.id, resetToken, 'reset', resetTokenExpiry.toISOString(), (err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to store reset token' });
      }

      // في تطبيق حقيقي ترسل عبر الإيميل، هنا نرسل التوكن فقط
      res.status(200).json({
        success: true,
        message: 'Password reset instructions sent',
        resetToken
      });
    });

  } catch (error) {
    res.status(500).json({ message: 'Error processing password reset', error: error.message });
  }
};

// إعادة تعيين كلمة المرور
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    if (!req.userModel.validatePasswordStrength(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and contain at least one number, one uppercase letter, and one special character'
      });
    }

    // البحث عن التوكن من جدول التوكنات مع النوع reset
    tokenStore.findByToken(token, 'reset', async (err, tokenData) => {
      if (err || !tokenData) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      // تحقق من انتهاء صلاحية التوكن
      if (new Date(tokenData.expires_at) < new Date()) {
        // حذف التوكن لأنه منتهي الصلاحية
        tokenStore.deleteByToken(token, 'reset', () => {});
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired'
        });
      }

      // جلب بيانات المستخدم حسب user_id في tokenData
      const user = await req.userModel.findById(tokenData.user_id);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'User not found'
        });
      }

      // تحديث كلمة السر (تقوم بحذف أي reset token مرتبط)
      await req.userModel.updatePassword(user.id, newPassword);

      // حذف كل توكنات التجديد (refresh tokens) الخاصة بالمستخدم (اختياري لكن جيد)
      await tokenStore.deleteAllForUser(user.id, 'refresh');

      // حذف توكن إعادة التعيين (reset token) الحالي بعد الاستخدام
      await tokenStore.deleteByToken(token, 'reset', () => {});

      res.status(200).json({
        success: true,
        message: 'Password has been reset successfully'
      });
    });

  } catch (error) {
    res.status(500).json({
      message: 'Error resetting password',
      error: error.message
    });
  }
};
