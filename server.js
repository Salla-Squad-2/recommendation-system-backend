// server code 
require('dotenv').config();
const express = require('express');
const app = express();
const { generateToken, verifyToken } = require('./jwtMiddleware');
const authRoutes = require('./routes/authRoutes');
const SECRET = process.env.JWT_SECRET;
const PORT =process.env.PORT || 3001;
// middleware settings 
app.use(express.json()); 
app.use('/auth', authRoutes);
app.post('/login', (req, res) => {
    // اتاكد من اسم api 
  const { username, password } = req.body;
  // هنا مجرد مثال ثابت، المفترض يكون فيه تحقق من قاعدة بيانات
// هنا احتاج اكلم المهندس علة هذا الموضوع مين راح يكون ادمن 
  if (username === 'admin' && password === 'Admin123') {
    const token = generateToken({ username, role: 'admin' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});
app.get('/protected', verifyToken, (req, res) => {
  res.json({ message: 'You have access!', user: req.user });
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
