const express = require('express');
const cors = require('cors');
const { Client } = require('@opensearch-project/opensearch');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3008;

// Enable CORS for frontend
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// OpenSearch client WITHOUT authentication
const client = new Client({
  node: 'http://localhost:5601',
  ssl: {
    rejectUnauthorized: false
  },
  maxRetries: 3,
  requestTimeout: 10000,
  sniffOnStart: false
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test OpenSearch connection
app.get('/test-opensearch', async (req, res) => {
  try {
    console.log('Testing OpenSearch connection without auth...');
    
    // Test basic connection
    const info = await client.info();
    console.log('OpenSearch info:', info.body);
    
    // List all indices
    const indices = await client.cat.indices({ format: 'json' });
    console.log('Available indices:', indices.body);
    
    res.json({
      success: true,
      opensearchInfo: info.body,
      indices: indices.body
    });
  } catch (err) {
    console.error('OpenSearch connection test failed:', err);
    res.status(500).json({
      success: false,
      error: `OpenSearch connection failed: ${err.message}`,
      details: err
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`OpenSearch URL: http://localhost:5601 (no auth)`);
}); 