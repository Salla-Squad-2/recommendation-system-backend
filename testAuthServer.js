const express = require('express');
require('dotenv').config();
const { generateTokens, verifyToken } = require('./jwtMiddleware');

// ✅ استيراد الرايت ليمتر من الملف الخارجي
const { authLimiter } = require('./middleware/rateLimiter');

const app = express();
app.use(express.json());

const PORT = process.env.TEST_PORT || 4000;

// ✅ راوت التحقق من التوكن
app.get('/test-auth', verifyToken, (req, res) => {
  res.json({
    message: '✅ Token is valid!',
    user: req.user
  });
});

// ✅ استخدام authLimiter من الملف الخارجي هنا
app.post('/issue-token', authLimiter, (req, res) => {
  const { id, email, role } = req.body;
  const { accessToken, refreshToken } = generateTokens({ id, email, role });
  res.json({ accessToken, refreshToken });
});

// 🔄 راوت لاختبار ريفرش توكن (بدون ليمتر حالياً)
app.post('/refresh-token', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  const newAccessToken = generateTokens({ id: '123', email: 'user@example.com', role: 'user' }).accessToken;
  res.json({ accessToken: newAccessToken });
});

// ✅ تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`✅ Test Auth API running on http://localhost:${PORT}`);
});
