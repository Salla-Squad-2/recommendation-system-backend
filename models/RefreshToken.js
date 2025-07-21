const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// إنشاء جدول tokens لو ما كان موجود
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,          -- "refresh" أو "reset"
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating tokens table:', err);
    } else {
      console.log('tokens table ready');
    }
  });
});

const tokenStore = {
  create: (userId, token, type, expiresAt, callback) => {
    const query = `INSERT INTO tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)`;
    db.run(query, [userId, token, type, expiresAt], function (err) {
      if (err) {
        console.error(`Error inserting ${type} token:`, err);
      } else {
        console.log(`${type} token created with ID: ${this.lastID}`);
      }
      callback(err, this?.lastID);
    });
  },

  findByToken: (token, type, callback) => {
    const query = `SELECT * FROM tokens WHERE token = ? AND type = ?`;
    db.get(query, [token, type], (err, row) => {
      if (err) {
        console.error(`Error finding ${type} token:`, err);
      }
      callback(err, row);
    });
  },

  deleteByToken: (token, type, callback) => {
    const query = `DELETE FROM tokens WHERE token = ? AND type = ?`;
    db.run(query, [token, type], function (err) {
      if (err) {
        console.error(`Error deleting ${type} token:`, err);
      } else {
        console.log(`Deleted ${type} token, changes: ${this.changes}`);
      }
      callback(err, this?.changes);
    });
  },

  deleteAllForUser: (userId, type, callback) => {
    const query = `DELETE FROM tokens WHERE user_id = ? AND type = ?`;
    db.run(query, [userId, type], function (err) {
      if (err) {
        console.error(`Error deleting all ${type} tokens for user:`, err);
      } else {
        console.log(`Deleted all ${type} tokens for user ${userId}, changes: ${this.changes}`);
      }
      if (callback) callback(err, this?.changes);
    });
  }
};

module.exports = tokenStore;
