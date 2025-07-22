const sqlite3 = require('sqlite3').verbose();

// إنشاء الاتصال بقاعدة البيانات
const db = new sqlite3.Database('./database.sqlite');

// تشغيل الإنشاءات داخل serialize لضمان الترتيب
db.serialize(() => {
  // إنشاء جدول المستخدمين
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT,
      password TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      role TEXT DEFAULT 'customer',
      created_at TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('✅ users table ready');
    }
  });

  // إنشاء جدول التوكنات (refresh / reset / email...)
  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL, -- refresh / reset / email-verification ...
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating tokens table:', err.message);
    } else {
      console.log('✅ tokens table ready');
    }
  });
});

// وظائف التعامل مع جدول التوكنات
const tokenStore = {
  create: (userId, token, type, expiresAt, callback) => {
    const query = `
      INSERT INTO tokens (user_id, token, type, expires_at)
      VALUES (?, ?, ?, ?)
    `;
    db.run(query, [userId, token, type, expiresAt], function (err) {
      if (err) {
        console.error(`❌ Error inserting ${type} token:`, err.message);
      } else {
        console.log(`✅ ${type} token created with ID: ${this.lastID}`);
      }
      if (callback) callback(err, this?.lastID);
    });
  },

  findByToken: (token, type, callback) => {
    const query = `
      SELECT * FROM tokens WHERE token = ? AND type = ?
    `;
    db.get(query, [token, type], (err, row) => {
      if (err) {
        console.error(`❌ Error finding ${type} token:`, err.message);
      }
      callback(err, row);
    });
  },

  deleteByToken: (token, type, callback) => {
    const query = `
      DELETE FROM tokens WHERE token = ? AND type = ?
    `;
    db.run(query, [token, type], function (err) {
      if (err) {
        console.error(`❌ Error deleting ${type} token:`, err.message);
      } else {
        console.log(`🗑️ Deleted ${type} token, changes: ${this.changes}`);
      }
      if (callback) callback(err, this?.changes);
    });
  },

  deleteAllForUser: (userId, type, callback) => {
    const query = `
      DELETE FROM tokens WHERE user_id = ? AND type = ?
    `;
    db.run(query, [userId, type], function (err) {
      if (err) {
        console.error(`❌ Error deleting all ${type} tokens:`, err.message);
      } else {
        console.log(`🗑️ Deleted all ${type} tokens for user ${userId}`);
      }
      if (callback) callback(err, this?.changes);
    });
  }
};

//module.exports = { db, tokenStore };
module.exports = tokenStore; // ✅ بدال ما تصدر كائن فيه db
