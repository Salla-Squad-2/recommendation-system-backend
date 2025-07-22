const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class User {
  constructor(dbFilePath = './database.sqlite') {
    this.db = new sqlite3.Database(dbFilePath, (err) => {
      if (err) {
        console.error('Could not connect to database', err);
      } else {
        console.log('Connected to SQLite database');
      }
    });

    this.initialize();
  }

  initialize() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT,
        password TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        role TEXT DEFAULT 'customer',
        created_at TEXT NOT NULL,
        reset_token TEXT,
        reset_token_expiry TEXT
      )
    `;

    this.db.run(createTableSQL, (err) => {
      if (err) {
        console.error('Failed to create users table:', err);
      } else {
        console.log('Users table ready');
      }
    });
  }

  validatePasswordStrength(password) {
    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
    return passwordRegex.test(password);
  }

  validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  create(userData) {
    return new Promise(async (resolve, reject) => {
      try {
        const { email, password, username, role } = userData;

        if (!this.validateEmail(email)) {
          return reject(new Error('Invalid email format'));
        }

        if (!this.validatePasswordStrength(password)) {
          return reject(new Error('Password must be at least 8 characters long and contain at least one number, one uppercase letter, and one special character'));
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const id = uuidv4();
        const createdAt = new Date().toISOString();
        const userRole = role || 'customer';

        const sql = `INSERT INTO users (id, email, username, password, status, role, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;

        this.db.run(sql, [id, email, username, hashedPassword, 'active', userRole, createdAt], function (err) {
          if (err) {
            return reject(err);
          }
          resolve({
            id,
            email,
            username,
            status: 'active',
            role: userRole,
            created_at: createdAt
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  findByEmail(email) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM users WHERE email = ?`;
      this.db.get(sql, [email], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  findById(userId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM users WHERE id = ?`;
      this.db.get(sql, [userId], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  validatePassword(user, password) {
    return bcrypt.compare(password, user.password);
  }

  updatePassword(userId, newPassword) {
    return new Promise(async (resolve, reject) => {
      try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const sql = `UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?`;
        this.db.run(sql, [hashedPassword, userId], function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  updateResetToken(userId, token, expiry) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?`;
      this.db.run(sql, [token, expiry.toISOString(), userId], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }

  findByResetToken(token) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM users WHERE reset_token = ?`;
      this.db.get(sql, [token], (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        if (new Date(row.reset_token_expiry) < new Date()) {
          return resolve(null); // Token expired
        }
        resolve(row);
      });
    });
  }
}

module.exports = User;
