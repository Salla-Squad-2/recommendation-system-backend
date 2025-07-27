const { Client } = require('@opensearch-project/opensearch');
require('dotenv').config();

const client = new Client({
  node: process.env.OS_URL || 'http://localhost:9200',
  auth: {
    username: process.env.OS_USERNAME || 'admin',
    password: process.env.OS_PASSWORD || 'admin'
  },
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  try {
    // Create users index
    await client.indices.create({
      index: 'users',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            email: { type: 'keyword' },
            password: { type: 'keyword' },
            status: { type: 'keyword' },
            created_at: { type: 'date' },
            roles: { type: 'keyword' }
          }
        }
      }
    });

    // Create refresh_tokens index
    await client.indices.create({
      index: 'refresh_tokens',
      body: {
        mappings: {
          properties: {
            user_id: { type: 'keyword' },
            token: { type: 'keyword' },
            expiry: { type: 'date' }
          }
        }
      }
    });

    // Create roles index
    await client.indices.create({
      index: 'roles',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'keyword' },
            permissions: { type: 'keyword' }
          }
        }
      }
    });

    // Create user_roles index
    await client.indices.create({
      index: 'user_roles',
      body: {
        mappings: {
          properties: {
            user_id: { type: 'keyword' },
            role_id: { type: 'keyword' }
          }
        }
      }
    });

    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

setupDatabase();
