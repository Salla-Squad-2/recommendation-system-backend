const express = require('express');
const cors = require('cors');
const { Client } = require('@opensearch-project/opensearch');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');

const app = express();
const port = process.env.PORT || 3008;

// OpenSearch client
const client = new Client({
  node: process.env.OS_URL,
  auth: {
    username: process.env.OS_USERNAME,
    password: process.env.OS_PASSWORD,
  },
  ssl: {
    rejectUnauthorized: false
  }
});

// Make OpenSearch client available to routes
app.set('opensearchClient', client);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// search with filters
app.get('/api/search', async (req, res) => {
  const { name, category, minPrice, maxPrice } = req.query;

  try {
    const searchQuery = {
      index: 'products-history-vectors',
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

    const result = await client.search(searchQuery);
    const products = result.body.hits.hits.map(hit => ({
      productCode: hit._source.productCode,
      name: hit._source.name,
      description: hit._source.description,
      price: hit._source.price,
      category: hit._source.category,
      quantity_of_product: hit._source.quantity_of_product
    }));

    res.json({
      success: true,
      products
    });
  } catch (err) {
    console.error('Error searching products:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to search products'
    });
  }
});

// Get related products
app.get('/api/related/:productCode', async (req, res) => {
  const { productCode } = req.params;

  try {
    const sourceProduct = await client.search({
      index: 'products-history-vectors',
      body: {
        query: {
          term: { productCode: productCode }
        }
      }
    });

    const product = sourceProduct.body.hits.hits[0]._source;

    const searchQuery = {
      index: 'products-history-vectors',
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
      similarity_score: hit._score
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
    const ordersWithProduct = await client.search({
      index: 'products-history-vectors',
      body: {
        size: 1000,
        query: {
          term: { productCode: productCode }
        },
        _source: ['order_id', 'productCode', 'name']
      }
    });

    const debugInfo = {
      productFound: ordersWithProduct.body.hits.total.value > 0,
      sourceProduct: ordersWithProduct.body.hits.hits.length > 0 ? 
        ordersWithProduct.body.hits.hits[0]._source : null,
      totalOrders: ordersWithProduct.body.hits.total.value,
      orderIds: []
    };

    const orderIds = ordersWithProduct.body.hits.hits.map(hit => {
      debugInfo.orderIds.push({
        order_id: hit._source.order_id,
        productCode: hit._source.productCode,
        name: hit._source.name
      });
      return hit._source.order_id;
    });

    if (orderIds.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found in any orders',
        debug: debugInfo
      });
    }

    const sourceProduct = await client.search({
      index: 'products-history-vectors',
      body: {
        query: {
          term: { productCode: productCode }
        }
      }
    });

    const product = sourceProduct.body.hits.hits[0]._source;

    const complementaryCategories = {
      'MENS BAGS': ['MENS CHAINS', 'MENS T-SHIRTS', 'MENS ACCESSORIES'],
      'WOMENS BAGS': ['WOMENS CHAINS', 'WOMENS T-SHIRTS', 'WOMENS ACCESSORIES'],
      'MENS T-SHIRTS': ['MENS BAGS', 'MENS CHAINS', 'MENS ACCESSORIES'],
      'WOMENS T-SHIRTS': ['WOMENS BAGS', 'WOMENS CHAINS', 'WOMENS ACCESSORIES'],
      'MENS CHAINS': ['MENS BAGS', 'MENS T-SHIRTS', 'MENS ACCESSORIES'],
      'WOMENS CHAINS': ['WOMENS BAGS', 'WOMENS T-SHIRTS', 'WOMENS ACCESSORIES']
    };

    const targetCategories = complementaryCategories[product.category] || [];
    const result = await client.search({
      index: 'products-history-vectors',
      body: {
        size: 10,
        query: {
          bool: {
            should: [
              {
                bool: {
                  must: [
                    { terms: { order_id: orderIds } }
                  ],
                  boost: 2.0
                }
              },
              {
                bool: {
                  must: [
                    { terms: { category: targetCategories } }
                  ],
                  boost: 1.5
                }
              },
              {
                knn: {
                  combination_vector: {
                    vector: product.combination_vector,
                    k: 5
                  }
                }
              }
            ],
            must_not: [
              { term: { productCode: productCode } },
              { term: { category: product.category } } 
            ]
          }
        },
        aggs: {
          product_counts: {
            terms: {
              field: 'productCode',
              size: 5,
              order: { _count: 'desc' }
            }
          }
        }
      }
    });

    const complementaryProducts = result.body.hits.hits.map(hit => ({
      productCode: hit._source.productCode,
      name: hit._source.name,
      description: hit._source.description,
      price: hit._source.price,
      category: hit._source.category,
      score: hit._score,
      recommendation_type: hit._source.order_id && orderIds.includes(hit._source.order_id) ? 
        'frequently_bought' : 
        targetCategories.includes(hit._source.category) ? 
          'complementary_category' : 'similar_product'
    }));

    res.json({
      success: true,
      sourceProduct: {
        productCode: product.productCode,
        name: product.name,
        category: product.category
      },
      complementaryProducts,
      debug: {
        ...debugInfo,
        targetCategories,
        totalComplementaryFound: complementaryProducts.length
      }
    });
  } catch (err) {
    console.error('Error getting frequently bought products:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get frequently bought products'
    });
  }
});

// Get all customers
app.get('/api/customers', async (req, res) => {
  try {
    const result = await client.search({
      index: 'products-history-vectors',
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
          'price'
        ],
        size: 100
      }
    });

    const customers = result.body.hits.hits
      .filter(hit => hit._source.order_id && hit._source.productCode) 
      .map(hit => ({
        customerId: hit._source.id_customer, 
        history: [{
          orderId: hit._source.order_id,
          productCode: hit._source.productCode,
          productName: hit._source.name,
          category: hit._source.category,
          purchaseDate: hit._source.purchase_date,
          description: hit._source.description,
          quantity: hit._source.quantity_of_product,
          price: hit._source.price
        }]
      }));

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
        index: 'products-history-vectors',
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
        price: hit._source.price
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

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
