# Product Recommendation System

A Node.js-based recommendation system using OpenSearch for product recommendations, user authentication, and search functionality.

## Features

### Authentication
- User registration with email validation and secure password requirements
- Login with JWT access tokens and refresh tokens
- Password reset functionality
- Secure token management using OpenSearch

### Product Recommendations
1. **Similar Products** (`/api/recommendations/similar/:productCode`)
   - Uses vector similarity (kNN) to find similar products
   - Returns top 100 similar items based on product vectors

2. **You May Like This** (`/api/recommendations/you-may-like/:customerId`)
   - Personalized recommendations based on customer's last purchase
   - Uses vector similarity to find products similar to recent purchases
   - Filters by same category for more relevant suggestions

3. **Frequently Bought Together** (`/api/recommendations/frequently-bought/:productCode`)
   - Analyzes order history to find co-purchased items
   - Returns top 10 products frequently bought with the specified item

## Project Structure

### `index.js`
- Main application file
- Sets up Express server
- Configures middleware
- Sets up OpenSearch client
- Mounts routes
- Adds health check endpoint

### `routes/`
- **authRoutes.js**: Authentication routes
- **recommendationRoutes.js**: Product recommendation routes

### `models/`
- **User.js**: User model for OpenSearch
- **RefreshToken.js**: Token management

### `scripts/`
- **createFakeUsers.js**: Script to create test users
- **viewOpenSearchData.js**: Script to view OpenSearch data

### Environment Configuration
- **.env.example**: Template for environment variables
   - Analyzes order history to find co-purchased items
   - Returns top 10 products frequently bought with the specified item

4. **Customer-Specific Recommendations** (`/api/recommendations/customer/:customerId`)
   - Analyzes customer's entire purchase history
   - Uses average vector of all purchases for recommendations
   - Considers category preferences

### Search Functionality
- Product search with multiple filters:
  - Name (with boosted relevance)
  - Category
  - Price range (min/max)
- Sort results by relevance and price

## API Endpoints

### Authentication
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Recommendations
```
GET /api/recommendations/similar/:productCode
GET /api/recommendations/you-may-like/:customerId
GET /api/recommendations/frequently-bought/:productCode
GET /api/recommendations/customer/:customerId
GET /api/search?name=&category=&minPrice=&maxPrice=
```

## Setup

### Prerequisites
- Node.js v16 or higher
- OpenSearch instance
- Docker (optional)

### Environment Variables
Create a `.env` file with:
```
PORT=3008
OS_URL=http://localhost:9200
OS_USERNAME=admin
OS_PASSWORD=admin
JWT_SECRET=your-jwt-secret
ACCESS_TOKEN=your-access-token
REFRESH_TOKEN=your-refresh-token
```

### Installation

1. **Without Docker:**
```bash
# Install dependencies
npm install

# Setup database indices
node scripts/setup-db.js

# Start server
node index.js
```

2. **With Docker:**
```bash
# Build image
docker build -t recommendation-system .

# Run container
docker run -p 3008:3008 --env-file .env recommendation-system
```

## Database Schema

### OpenSearch Indices

1. **users**
```json
{
  "id": "string",
  "email": "string",
  "username": "string",
  "password": "string (hashed)",
  "status": "string",
  "created_at": "date"
}
```

2. **refresh_tokens**
```json
{
  "user_id": "string",
  "token": "string",
  "expires_at": "date"
}
```

3. **products-history-vectors**
```json
{
  "productCode": "string",
  "name": "string",
  "description": "string",
  "price": "number",
  "category": "string",
  "combination_vector": "float[]"
}
```

4. **orders**
```json
{
  "order_id": "string",
  "products": [
    {
      "productCode": "string",
      "name": "string",
      "price": "number",
      "category": "string",
      "quantity": "number"
    }
  ],
  "purchase_date": "date"
}
```

## Docker Support

The system can be containerized using Docker. The included Dockerfile:
- Uses Node.js 16 Alpine base image
- Installs production dependencies only
- Sets up environment for running the application
- Exposes port 3008
- Implements health checks

## Security Features
- Password hashing with bcrypt
- JWT token-based authentication
- Refresh token rotation
- Input validation and sanitization
- CORS enabled
- Rate limiting (configurable)

## Error Handling
- Comprehensive error messages
- HTTP status codes
- Request validation
- OpenSearch connection error handling

## Performance Considerations
- kNN search for fast vector similarity
- Indexed queries for quick lookups
- Response pagination
- Caching headers
- Efficient vector calculations
