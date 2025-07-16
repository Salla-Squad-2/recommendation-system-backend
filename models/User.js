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
      console.log('Checking if index exists:', this.index);
      // Check if index exists
      const { body: exists } = await this.client.indices.exists({
        index: this.index
      });

      if (!exists) {
        console.log('Creating new index:', this.index);
        // Create index with mappings
        const { body: response } = await this.client.indices.create({
          index: this.index,
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                email: { type: 'keyword' },
                username: { type: 'keyword' },
                password: { type: 'keyword' },
                status: { type: 'keyword' },
                created_at: { type: 'date' }
              }
            }
          }
        });
        console.log('Index created successfully:', this.index);
        console.log('Response:', JSON.stringify(response, null, 2));
      } else {
        console.log('Index already exists:', this.index);
      }
    } catch (error) {
      console.error('Error initializing users index:', error);
      throw error;
    }
  }

  validatePassword(password) {
    // Password must be at least 8 characters long and contain at least one number, one uppercase letter, and one special character
    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
    return passwordRegex.test(password);
  }

  validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  async create(userData) {
    try {
      // Validate email and password
      if (!this.validateEmail(userData.email)) {
        throw new Error('Invalid email format');
      }
      if (!this.validatePassword(userData.password)) {
        throw new Error('Password must be at least 8 characters long and contain at least one number, one uppercase letter, and one special character');
      }
      await this.initialize();

      const { email, password, username } = userData;
      console.log('Creating user with email:', email);

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const user = {
        id: uuidv4(),
        email,
        username,
        password: hashedPassword,
        status: 'active',
        created_at: new Date().toISOString()
      };

      console.log('Indexing user document...');
      const { body: response } = await this.client.index({
        index: this.index,
        id: user.id,
        body: user,
        refresh: true
      });

      console.log('User created successfully!');
      console.log('Response:', JSON.stringify(response, null, 2));

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
          password: hashedPassword
        }
      }
    });
  }
}

module.exports = User;
