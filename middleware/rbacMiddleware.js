const adminEmails = require('../config/adminEmails'); // تأكد من المسار الصحيح

function checkRole(allowedRoles = []) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const userEmail = req.user?.email;

    // إذا من ضمن الأدوار المطلوبة
    if (allowedRoles.includes('admin')) {
      // لازم يتوفر الدور ويكون الإيميل من ضمن إيميلات الإدمن
      if (userRole !== 'admin' || !adminEmails.includes(userEmail)) {
        return res.status(403).json({ message: 'صلاحيات غير كافية (إدمن فقط)' });
      }
    } else {
      // تحقق عادي للدور فقط
      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'غير مصرح لك بالوصول' });
      }
    }

    next(); // السماح بالاستمرار
  };
}

module.exports = { checkRole };
