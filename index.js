const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();

//app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : false);
//if (process.env.TRUST_PROXY && process.env.TRUST_PROXY === 'true') {
  //app.set('trust proxy', true);
//} else {
  //app.set('trust proxy', false);
//}

// test loopback proxy
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 'loopback');
}

app.use((req, res, next) => {
  console.log('Client IP:', req.ip);
  next();
});

app.use(express.json());

// الحين هنا كتبت كود يمنع اي اتصال خارج 
const corsOptions = {
  origin: ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
  // http://127.0.0.1:5500', 'http://localhost:5500
};

app.use(cors(corsOptions));

// Swagger documentation setup:
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./routes/swaggerSpec');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const authRoutes = require('./routes/authRoutes'); // Import routes
const recommendationRoutes = require('./routes/recommendationRoutes');
// Mount authentication routes at /api/auth (match ElafSec)
app.use('/api/auth', authRoutes);
console.log("✅ Loaded /api/auth routes");

// Mount recommendation routes if needed
app.use('/api/recommendations', recommendationRoutes);

const { Client } = require('@opensearch-project/opensearch');
console.log('JWT_SECRET from env:', process.env.JWT_SECRET);


const { authLimiter } = require('./middleware/rateLimiter');
const port = process.env.PORT || 3008;

// Enable CORS for frontend
app.use(cors({
  origin: ['http://localhost:5173'], // Allow both localhost and 127.0.0.1
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


// Parse JSON bodies
app.use(express.json());

// OpenSearch client
const client = new Client({
  node: process.env.OS_URL || 'http://localhost:9200',
  auth: {
    username: process.env.OS_USERNAME || 'admin',
    password: process.env.OS_PASSWORD || 'admin',
  },
  ssl: {
    rejectUnauthorized: false
  },
  // Add more connection options
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
    console.log('Testing OpenSearch connection...');
    
    // Test basic connection
    const info = await client.info();
    console.log('OpenSearch info:', info.body);
    
    // List all indices
    const indices = await client.transport.request({
  method: 'GET',
  path: '/_cat/indices',
  querystring: {
    format: 'json'
  }
});

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

// search with filters
app.get('/api/search', async (req, res) => {
  const { name, category, minPrice, maxPrice } = req.query;

  try {
    // First, check if the index exists
    try {
      const indexExists = await client.indices.exists({
        index: 'products-history-vectors-img'
      });
      
      if (!indexExists.body) {
        console.log('Index products-history-vectors-img does not exist');
        return res.json({
          success: true,
          products: [],
          message: 'No products index found'
        });
      }
    } catch (indexError) {
      console.error('Error checking index:', indexError);
      return res.status(500).json({
        success: false,
        error: 'Error checking OpenSearch index'
      });
    }

    const searchQuery = {
      index: 'products-history-vectors-img',
      body: {
        size: 100
      }
    };

    if (name || category || minPrice || maxPrice) {
      searchQuery.body.query = {
        bool: {
          must: []
        }
      };

      if (name) {
        searchQuery.body.query.bool.must.push({
          match: { name: name }
        });
      }

      if (category) {
        searchQuery.body.query.bool.must.push({
          term: { category: category }
        });
      }

      if (minPrice || maxPrice) {
        searchQuery.body.query.bool.must.push({
          range: {
            price: {
              ...(minPrice && { gte: parseFloat(minPrice) }),
              ...(maxPrice && { lte: parseFloat(maxPrice) })
            }
          }
        });
      }
    }

    console.log('Executing search query:', JSON.stringify(searchQuery, null, 2));
    const result = await client.search(searchQuery);
    console.log('Search result hits:', result.body.hits.total.value);
    
    const products = result.body.hits.hits.map(hit => ({
      productCode: hit._source.productCode,
      name: hit._source.name,
      description: hit._source.description,
      price: hit._source.price,
      category: hit._source.category,
      quantity_of_product: hit._source.quantity_of_product,

      // Include all possible image fields from OpenSearch
      image: hit._source.image || hit._source.image_url || hit._source.product_image || hit._source.img_url || hit._source.photo_url || hit._source.picture_url || hit._source.thumbnail || hit._source.product_photo || hit._source.photo || hit._source.picture || hit._source.img

    }));

    res.json({
      success: true,
      products
    });
  } catch (err) {
    console.error('Error searching products:', err);
    console.error('Error details:', err.message);
    res.status(500).json({
      success: false,
      error: `Failed to search products: ${err.message}`
    });
  }
});

// Get related products
app.get('/api/related/:productCode', async (req, res) => {
  const { productCode } = req.params;

  try {
    const sourceProduct = await client.search({
      index: 'products-history-vectors-img',
      body: {
        query: {
          term: { productCode: productCode }
        }
      }
    });

    if (sourceProduct.body.hits.total.value === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const product = sourceProduct.body.hits.hits[0]._source;

    const searchQuery = {
      index: 'products-history-vectors-img',
      body: {
        size: 10,
        query: {
          knn: {
            combination_vector: {
              vector: product.combination_vector,
              k: 5
            }
          }
        }
      }
    };

    const result = await client.search(searchQuery);

    const relatedProducts = result.body.hits.hits.map(hit => ({
      productCode: hit._source.productCode,
      name: hit._source.name,
      description: hit._source.description,
      price: hit._source.price,
      category: hit._source.category,
      similarity_score: hit._score,

      // Include all possible image fields from OpenSearch
      image: hit._source.image || hit._source.image_url || hit._source.product_image || hit._source.img_url || hit._source.photo_url || hit._source.picture_url || hit._source.thumbnail || hit._source.product_photo || hit._source.photo || hit._source.picture || hit._source.img

    }));

    res.json({
      success: true,
      sourceProduct: {
        productCode: product.productCode,
        name: product.name,
        category: product.category
      },
      relatedProducts
    });
  } catch (err) {
    console.error('Error getting related products:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get related products'
    });
  }
});

// Get frequently bought together products
app.get('/api/frequently-bought/:productCode', async (req, res) => {
  const { productCode } = req.params;

  try {
    // Get all products except the current one
    const allProducts = await client.search({
      index: 'products-history-vectors-img',
      body: {
        size: 1000, // adjust if you expect more products
        query: {
          bool: {
            must_not: [
              { term: { productCode: productCode } }
            ]
          }
        }
      }
    });

    const hits = allProducts.body.hits.hits;
    // Shuffle the array
    const shuffled = hits.sort(() => 0.5 - Math.random());
    // Pick 5 random products
    const randomProducts = shuffled.slice(0, 5);

    const complementaryProducts = randomProducts.map(hit => ({
      productCode: hit._source.productCode,
      name: hit._source.name,
      description: hit._source.description,
      price: hit._source.price,
      category: hit._source.category,
      // Include all possible image fields from OpenSearch
      image: hit._source.image || hit._source.image_url || hit._source.product_image || hit._source.img_url || hit._source.photo_url || hit._source.picture_url || hit._source.thumbnail || hit._source.product_photo || hit._source.photo || hit._source.picture || hit._source.img
    }));

    res.json({
      success: true,
      complementaryProducts
    });
  } catch (err) {
    console.error('Error getting frequently bought products:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get frequently bought products'
    });
  }
});

// Get customer recommendations
app.get('/api/customer-recommendations/:customerId', async (req, res) => {
  const { customerId } = req.params;

  try {
    // First, get the customer's purchase history
    const customerHistory = await client.search({
      index: 'products-history-vectors-img',
      body: {
        query: {
          match: { 
            id_customer: customerId 
          }
        },
        size: 100
      }
    });

    if (customerHistory.body.hits.total.value === 0) {
      return res.status(404).json({
        success: false,
        error: 'No purchase history found for this customer'
      });
    }

    // Get the customer's purchased products
    const purchasedProducts = customerHistory.body.hits.hits.map(hit => hit._source);
    
    // Get unique categories the customer has purchased from
    const customerCategories = [...new Set(purchasedProducts.map(p => p.category))];
    
    // Get unique product codes the customer has purchased
    const customerProductCodes = [...new Set(purchasedProducts.map(p => p.productCode))];

    // Find products in similar categories that the customer hasn't purchased
    const recommendations = await client.search({
      index: 'products-history-vectors-img',
      body: {
        size: 20,
        query: {
          bool: {
            should: [
              {
                terms: {
                  category: customerCategories
                }
              },
              {
                knn: {
                  combination_vector: {
                    vector: purchasedProducts[0]?.combination_vector || [0, 0, 0, 0, 0],
                    k: 10
                  }
                }
              }
            ],
            must_not: [
              {
                terms: {
                  productCode: customerProductCodes
                }
              }
            ]
          }
        }
      }
    });

    const recommendationsList = recommendations.body.hits.hits.map(hit => ({
      productCode: hit._source.productCode,
      name: hit._source.name,
      description: hit._source.description,
      price: hit._source.price,
      category: hit._source.category,
      score: hit._score,
      // Include all possible image fields from OpenSearch
      image: hit._source.image || hit._source.image_url || hit._source.product_image || hit._source.img_url || hit._source.photo_url || hit._source.picture_url || hit._source.thumbnail || hit._source.product_photo || hit._source.photo || hit._source.picture || hit._source.img
    }));

    res.json({
      success: true,
      recommendations: recommendationsList
    });
  } catch (err) {
    console.error('Error getting customer recommendations:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer recommendations'
    });
  }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const result = await client.search({
      index: 'products-history-vectors-img',
      body: {
        query: {
          match_all: {}
        },
        _source: [
          'order_id',
          'id_customer', 
          'productCode',
          'name',
          'category',
          'purchase_date',
          'description',
          'quantity_of_product',
          'price',
          'image',
          'image_url',
          'product_image',
          'img_url',
          'photo_url',
          'picture_url',
          'thumbnail',
          'product_photo',
          'photo',
          'picture',
          'img'
          
        ],
        size: 100
      }
    });

    const orders = result.body.hits.hits
      .filter(hit => hit._source.order_id && hit._source.productCode)
      .map(hit => ({
        orderId: hit._source.order_id,
        customerId: hit._source.id_customer,
        customerName: `Customer ${hit._source.id_customer}`,
        productCode: hit._source.productCode,
        productName: hit._source.name,
        productDescription: hit._source.description,
        price: hit._source.price,
        category: hit._source.category,
        quantity: hit._source.quantity_of_product,
        purchaseDate: hit._source.purchase_date,
        status: 'Delivered',
        image: hit._source.image || hit._source.image_url || hit._source.product_image || hit._source.img_url || hit._source.photo_url || hit._source.picture_url || hit._source.thumbnail || hit._source.product_photo || hit._source.photo || hit._source.picture || hit._source.img
      }));

    res.json({
      success: true,
      orders
    });
  } catch (err) {
    console.error('Error getting orders:', err.message, '\nFull error:', err);
    res.status(500).json({
      success: false,
      error: `Failed to get orders: ${err.message}`
    });
  }
});

// Get all customers
app.get('/api/customers', async (req, res) => {
  try {
    const result = await client.search({
      index: 'products-history-vectors-img',
      body: {
        query: {
          match_all: {}
        },
        _source: [
          'id_customer',  
          'order_id',
          'productCode',
          'name',
          'category',
          'purchase_date',
          'description',
          'quantity_of_product',
          'price',
          'image',
          'image_url',
          'product_image',
          'img_url',
          'photo_url',
          'picture_url',
          'thumbnail',
          'product_photo',
          'photo',
          'picture',
          'img'
          
        ],
        size: 1000
      }
    });

    // Group by customer ID to aggregate their purchase history
    const customerMap = new Map();
    
    result.body.hits.hits
      .filter(hit => hit._source.id_customer && hit._source.order_id && hit._source.productCode)
      .forEach(hit => {
        const customerId = hit._source.id_customer;
        const purchase = {
          orderId: hit._source.order_id,
          productCode: hit._source.productCode,
          productName: hit._source.name,
          category: hit._source.category,
          purchaseDate: hit._source.purchase_date,
          description: hit._source.description,
          quantity: hit._source.quantity_of_product,
          price: hit._source.price,
          image: hit._source.image || hit._source.image_url || hit._source.product_image || hit._source.img_url || hit._source.photo_url || hit._source.picture_url || hit._source.thumbnail || hit._source.product_photo || hit._source.photo || hit._source.picture || hit._source.img
        };

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customerId: customerId,
            history: []
          });
        }
        customerMap.get(customerId).history.push(purchase);
      });

    const customers = Array.from(customerMap.values());

    res.json({
      success: true,
      data: customers
    });
  } catch (err) {
    console.error('Error getting customers:', err.message, '\nFull error:', err);
    res.status(500).json({
      success: false,
      error: `Failed to get customers: ${err.message}`
    });
  }
});

// Get customer data and orders by ID
app.get('/api/customers/:customerId', async (req, res) => {
  const { customerId } = req.params;

  try {
    const indices = await client.cat.indices({ format: 'json' });
    const indexNames = indices.body.map(index => index.index);
    console.log('Available indices:', indexNames);

    try {
      const customerHistory = await client.search({
        index: 'products-history-vectors-img',
        body: {
          query: {
            match: { 
              id_customer: customerId 
            }
          },
          sort: [
            { purchase_date: { order: 'desc' } }
          ]
        }
      });

      if (customerHistory.body.hits.total.value === 0) {
        return res.status(404).json({
          success: false,
          error: 'No purchase history found for this customer'
        });
      }

      const purchases = customerHistory.body.hits.hits.map(hit => ({
        orderId: hit._source.order_id,
        productCode: hit._source.productCode,
        productName: hit._source.name,
        category: hit._source.category,
        purchaseDate: hit._source.purchase_date,
        description: hit._source.description,
        quantity: hit._source.quantity_of_product,
        price: hit._source.price,
        image: hit._source.image || hit._source.image_url || hit._source.product_image || hit._source.img_url || hit._source.photo_url || hit._source.picture_url || hit._source.thumbnail || hit._source.product_photo || hit._source.photo || hit._source.picture || hit._source.img
      }));

      const orderMap = new Map();
      purchases.forEach(purchase => {
        if (!orderMap.has(purchase.orderId)) {
          orderMap.set(purchase.orderId, {
            orderId: purchase.orderId,
            purchaseDate: purchase.purchaseDate,
            items: []
          });
        }
        orderMap.get(purchase.orderId).items.push({
          productCode: purchase.productCode,
          name: purchase.productName,
          category: purchase.category,
          description: purchase.description,
          quantity: purchase.quantity,
          price: purchase.price
        });
      });

      const orders = Array.from(orderMap.values());
      const totalOrders = orders.length;
      const totalItems = purchases.length;
      const totalSpent = purchases.reduce((sum, p) => sum + (parseFloat(p.price) * parseInt(p.quantity)), 0);

      res.json({
        success: true,
        data: {
          customerInfo: {
            id: customerId,
            statistics: {
              totalOrders,
              totalItems,
              totalSpent: totalSpent.toFixed(2)
            }
          },
          orders: orders
        }
      });
    } catch (searchError) {
      console.error('Error searching customer history:', searchError);
      res.status(500).json({
        success: false,
        error: 'Error searching for customer history'
      });
    }
  } catch (error) {
    console.error('Error checking indices:', error);
    res.status(500).json({
      success: false,
      error: 'Error connecting to database'
    });
  }
});


//app.set('trust proxy', true);

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`OpenSearch URL: ${process.env.OS_URL || 'http://localhost:9200'}`);
});
