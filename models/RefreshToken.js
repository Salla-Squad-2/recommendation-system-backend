class RefreshTokenStore {
  constructor(client) {
    this.client = client;
    this.index = 'refresh_tokens';
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
                user_id: { type: 'keyword' },
                token: { type: 'keyword' },
                expiry: { type: 'date' }
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Error initializing refresh tokens index:', error);
      throw error;
    }
  }

  async create(userId, token, expiresAt) {
    await this.client.index({
      index: this.index,
      body: {
        user_id: userId,
        token: token,
        expiry: expiresAt
      },
      refresh: true
    });
  }

  async findByToken(token) {
    try {
      const { body } = await this.client.search({
        index: this.index,
        body: {
          query: {
            term: { token: token }
          }
        }
      });

      if (body.hits.total.value === 0) return null;

      const tokenData = body.hits.hits[0]._source;
      if (new Date() > new Date(tokenData.expiry)) {
        await this.deleteByToken(token);
        return null;
      }

      return {
        userId: tokenData.user_id,
        token: tokenData.token,
        expiresAt: tokenData.expiry
      };
    } catch (error) {
      console.error('Error finding refresh token:', error);
      return null;
    }
  }

  async deleteByToken(token) {
    try {
      await this.client.deleteByQuery({
        index: this.index,
        body: {
          query: {
            term: { token: token }
          }
        },
        refresh: true
      });
    } catch (error) {
      console.error('Error deleting refresh token:', error);
    }
  }

  async deleteAllForUser(userId) {
    try {
      await this.client.deleteByQuery({
        index: this.index,
        body: {
          query: {
            term: { user_id: userId }
          }
        },
        refresh: true
      });
    } catch (error) {
      console.error('Error deleting user refresh tokens:', error);
    }
  }
}

module.exports = RefreshTokenStore;
