const jwt = require('jsonwebtoken');
// هنا نستخدم كتبة لتوليد التوكنات 
require('dotenv').config();
const { v4: uuidv4 } = require('uuid'); 
const SECRET = process.env.JWT_SECRET;
// هنا راح اقرا الكي الي بستخدمة من ملف البيئة 
// دالة لإنشاء التوكن
function generateAccessToken(payload) {
  // هنا بنسوي توقيع للتوكن مع البايلود والسر
  return jwt.sign(payload, SECRET, { expiresIn: '1h' }); // التوكن صالح لمدة ساعة
}
function generateRefreshToken() {
  return uuidv4();
  // فائدة هذي الميثود هي تجديد التوكن الي بعد ساعة 
}
function generateTokens(user) {
  const accessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });
  const refreshToken = generateRefreshToken();

  return { accessToken, refreshToken };
}

// ميدل وير للتحقق من التوكن في الطلبات المحمية
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Access denied. Token missing.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token.' });
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyToken
};