const sqlite3 = require('sqlite3').verbose();

// Open or create the database
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  // Create the refresh_tokens table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating the table:', err.message);
    } else {
      console.log('refresh_tokens table created successfully');
    }
    db.close();
  });
});
