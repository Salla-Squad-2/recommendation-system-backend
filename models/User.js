const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Client } = require('@opensearch-project/opensearch');

class User {
  constructor(client) {
    this.client = client;
    this.index = 'users';
    this.rolesIndex = 'user_roles';
    this.initialize();
  }

  async initialize() {
    try {
      const { body: exists } = await this.client.indices.exists({
        index: this.index
      });

      if (!exists) {
        await this.client.indices.create({
          index: this.index,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                email: { type: 'keyword' },
                username: { type: 'keyword' },
                password: { type: 'keyword' },
                status: { type: 'keyword' },
                created_at: { type: 'date' },
                reset_token: { type: 'keyword' },
                reset_token_expiry: { type: 'date' }
              }
            }
          }
        });
        console.log('Index created successfully:', this.index);
      } else {
        console.log('Index already exists:', this.index);
      }
    } catch (error) {
      console.error('Error initializing users index:', error);
      throw error;
    }
  }

  validatePasswordStrength(password) {
    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
    return passwordRegex.test(password);
  }

  validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  async create(userData) {
    try {
      if (!this.validateEmail(userData.email)) {
        throw new Error('Invalid email format');
      }

      if (!this.validatePasswordStrength(userData.password)) {
        throw new Error('Password must be at least 8 characters long and contain at least one number, one uppercase letter, and one special character');
      }

      await this.initialize();

      const { email, password, username } = userData;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const user = {
        id: uuidv4(),
        email,
        username,
        password: hashedPassword,
        status: 'active',
        created_at: new Date().toISOString(),
        reset_token: null,
        reset_token_expiry: null
      };

      await this.client.index({
        index: this.index,
        id: user.id,
        body: user,
        refresh: true
      });

      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async findByEmail(email) {
    const result = await this.client.search({
      index: this.index,
      body: {
        query: {
          term: { email: email }
        }
      }
    });

    if (result.body.hits.total.value === 0) {
      return null;
    }

    return result.body.hits.hits[0]._source;
  }

  async validatePassword(user, password) {
    return bcrypt.compare(password, user.password);
  }

  async updatePassword(userId, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.client.update({
      index: this.index,
      id: userId,
      body: {
        doc: {
          password: hashedPassword,
          reset_token: null,
          reset_token_expiry: null
        }
      }
    });
  }

  async updateResetToken(userId, token, expiry) {
    await this.client.update({
      index: this.index,
      id: userId,
      body: {
        doc: {
          reset_token: token,
          reset_token_expiry: expiry.toISOString()
        }
      }
    });
  }
  

async findByResetToken(token) {
  console.log('Looking for reset token:', token);

  const result = await this.client.search({
    index: this.index,
    body: {
      query: {
        term: { reset_token: token }
      }
    }
  });

  if (result.body.hits.total.value === 0) {
    console.log('No reset token found');
    return null;
  }

  const user = result.body.hits.hits[0]._source;

  // ✅ تحقق من تاريخ الانتهاء
  if (new Date(user.reset_token_expiry) < new Date()) {
    console.log('Reset token has expired');
    return null;
  }

  console.log('Found user reset token expiry:', user.reset_token_expiry);
  return user;
}
// داخل كلاس User
async findById(userId) {
  try {
    const result = await this.client.get({
      index: this.index,
      id: userId
    });
    return result.body._source;
  } catch (error) {
    if (error.meta.statusCode === 404) {
      return null;
    }
    throw error;
  }
}


}
module.exports = User;
