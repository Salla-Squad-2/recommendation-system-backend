const express = require('express');
const router = express.Router();

// Helper function to calculate average vector
const calculateAverageVector = (purchases) => {
  return purchases.reduce((acc, purchase) => {
    const vector = purchase._source.combination_vector;
    return vector.map((val, idx) => (acc[idx] || 0) + val / purchases.length);
  }, []);
};

// Helper function to process purchase history
const processPurchaseHistory = (hits) => {
  return hits.reduce((orders, hit) => {
    const purchase = hit._source;
    const orderId = purchase.order_id;
    
    if (!orders[orderId]) {
      orders[orderId] = {
        orderId: orderId,
        purchaseDate: purchase.purchase_date,
        items: []
      };
    }
    
    orders[orderId].items.push({
      productCode: purchase.productCode,
      name: purchase.name,
      price: purchase.price,
      category: purchase.category,
      quantity: purchase.quantity_of_product
    });
    
    return orders;
  }, {});
};

// Get similar products based on vectors (Content-based recommendations)
router.get('/similar/:productCode', async (req, res) => {
  const { productCode } = req.params;
  const client = req.app.get('opensearchClient');

  try {
    // First get the source product's vectors
    const sourceProduct = await client.search({
      index: 'products-history-vectors',
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
    // Get similar products using kNN search with combination vector
    const result = await client.search({
      index: 'products-history-vectors',
      body: {
        size: 100,
        query: {
          knn: {
            combination_vector: {
              vector: product.combination_vector,
              k: 100
            }
          }
        }
      }
    });

    // Filter out the source product and map the results
    const recommendations = result.body.hits.hits
      .filter(hit => hit._source.productCode !== productCode)
      .map(hit => ({
        productCode: hit._source.productCode,
        name: hit._source.name,
        description: hit._source.description,
        price: hit._source.price,
        category: hit._source.category,
        quantity_of_product: hit._source.quantity_of_product,
        purchase_date: hit._source.purchase_date,
        order_id: hit._source.order_id
      }));

    res.json({
      success: true,
      sourceProduct: {
        productCode: product.productCode,
        name: product.name,
        category: product.category,
        description: product.description,
        price: product.price
      },
      recommendations
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting recommendations'
    });
  }
});

// Get customer-specific recommendations
router.get('/customer/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const client = req.app.get('opensearchClient');

  try {
    // First get the customer's purchase history with sorting by date
    const customerHistory = await client.search({
      index: 'products-history-vectors',
      body: {
        query: {
          term: { id_customer: customerId }
        },
        sort: [{ purchase_date: { order: 'desc' } }]
      }
    });

    if (customerHistory.body.hits.total.value === 0) {
      return res.status(404).json({
        success: false,
        error: 'No purchase history found for this customer'
      });
    }

    const customerPurchases = customerHistory.body.hits.hits;
    const avgVector = calculateAverageVector(customerPurchases);

    // Find similar products using the average of all purchase vectors
    const result = await client.search({
      index: 'products-history-vectors',
      body: {
        size: 100,
        query: {
          bool: {
            must: [{
              knn: {
                combination_vector: {
                  vector: avgVector,
                  k: 30
                }
              }
            }],
            should: [{
              terms: {
                category: customerPurchases.map(p => p._source.category)
              }
            }],
            must_not: [{
              terms: {
                productCode: customerPurchases.map(p => p._source.productCode)
              }
            }]
          }
        }
      }
    });

    const purchaseHistory = processPurchaseHistory(customerHistory.body.hits.hits);

    res.json({
      success: true,
      customerHistory: Object.values(purchaseHistory),
      recommendations: result.body.hits.hits.map(hit => ({
        productCode: hit._source.productCode,
        name: hit._source.name,
        price: hit._source.price,
        category: hit._source.category,
        score: hit._score
      }))
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting customer recommendations'
    });
  }
});

// Get frequently bought together products
router.get('/frequently-bought/:productCode', async (req, res) => {
  const { productCode } = req.params;
  const client = req.app.get('opensearchClient');

  try {
    // Get orders containing the product
    const orders = await client.search({
      index: 'orders',
      body: {
        query: {
          term: { 'products.productCode': productCode }
        },
        size: 1000
      }
    });

    if (orders.body.hits.total.value === 0) {
      return res.status(404).json({
        success: false,
        error: 'No orders found with this product'
      });
    }

    const coOccurrences = {};
    orders.body.hits.hits.forEach(order => {
      order._source.products
        .filter(p => p.productCode !== productCode)
        .forEach(product => {
          if (!coOccurrences[product.productCode]) {
            coOccurrences[product.productCode] = {
              count: 0,
              product: product
            };
          }
          coOccurrences[product.productCode].count++;
        });
    });
    
    const recommendations = Object.values(coOccurrences)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(item => ({
        ...item.product,
        frequency: item.count
      }));

    res.json({
      success: true,
      totalOrders: orders.body.hits.total.value,
      recommendations
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting frequently bought items'
    });
  }
});

// Search products
router.get('/search', async (req, res) => {
  const { name, category, minPrice, maxPrice } = req.query;
  const client = req.app.get('opensearchClient');

  try {
    const searchQuery = {
      bool: {
        must: []
      }
    };

    if (name) {
      searchQuery.bool.must.push({
        multi_match: {
          query: name,
          fields: ['name^3', 'description']
        }
      });
    }

    if (category) {
      searchQuery.bool.must.push({
        term: { category: category.toLowerCase() }
      });
    }

    if (minPrice || maxPrice) {
      searchQuery.bool.must.push({
        range: {
          price: {
            ...(minPrice && { gte: parseFloat(minPrice) }),
            ...(maxPrice && { lte: parseFloat(maxPrice) })
          }
        }
      });
    }

    const result = await client.search({
      index: 'products-history-vectors',
      body: {
        query: searchQuery,
        sort: [{ _score: 'desc' }, { price: 'asc' }]
      }
    });

    res.json({
      success: true,
      total: result.body.hits.total.value,
      products: result.body.hits.hits.map(hit => ({
        productCode: hit._source.productCode,
        name: hit._source.name,
        description: hit._source.description,
        price: hit._source.price,
        category: hit._source.category
      }))
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error searching products'
    });
  }
});

// Get frequently bought together products
router.get('/frequently-bought/:productCode', async (req, res) => {
  const { productCode } = req.params;
  const client = req.app.get('opensearchClient');

  try {
    // First get all orders containing the source product
    const ordersWithProduct = await client.search({
      index: 'order_items',
      body: {
        query: {
          term: { productCode: productCode }
        },
        _source: ['order_id']
      },
      size: 100
    });

    if (ordersWithProduct.body.hits.total.value === 0) {
      return res.status(404).json({
        success: false,
        error: 'No orders found with this product'
      });
    }

    const orderIds = ordersWithProduct.body.hits.hits.map(hit => hit._source.order_id);
    const productsInOrders = await client.search({
      index: 'order_items',
      body: {
        query: {
          bool: {
            must: [
              {
                terms: { order_id: orderIds }
              },
              {
                bool: {
                  must_not: {
                    term: { productCode: productCode }
                  }
                }
              }
            ]
          }
        },
        aggs: {
          product_counts: {
            terms: {
              field: 'productCode',
              size: 5
            },
            aggs: {
              product_details: {
                top_hits: {
                  size: 1,
                  _source: ['name', 'category', 'price']
                }
              }
            }
          }
        },
        size: 0
      }
    });

    const recommendations = productsInOrders.body.aggregations.product_counts.buckets.map(bucket => ({
      productCode: bucket.key,
      name: bucket.product_details.hits.hits[0]._source.name,
      category: bucket.product_details.hits.hits[0]._source.category,
      price: bucket.product_details.hits.hits[0]._source.price,
      frequency: bucket.doc_count
    }));

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error finding frequently bought together products'
    });
  }
});

// Get 'You May Like This' recommendations based on customer's last purchase
router.get('/you-may-like/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const client = req.app.get('opensearchClient');

  try {
    // Get customer's most recent purchase
    const lastPurchase = await client.search({
      index: 'products-history-vectors',
      body: {
        query: {
          term: { id_customer: customerId }
        },
        sort: [{ purchase_date: { order: 'desc' } }],
        size: 1
      }
    });

    if (lastPurchase.body.hits.total.value === 0) {
      return res.status(404).json({
        success: false,
        error: 'No purchase history found for this customer'
      });
    }

    const lastPurchaseVector = lastPurchase.body.hits.hits[0]._source.combination_vector;
    const lastPurchaseProduct = lastPurchase.body.hits.hits[0]._source;

    // Find similar products using kNN search with the last purchase vector
    const result = await client.search({
      index: 'products-history-vectors',
      body: {
        size: 10,
        query: {
          bool: {
            must: [{
              knn: {
                combination_vector: {
                  vector: lastPurchaseVector,
                  k: 10
                }
              }
            }],
            must_not: [
              // Exclude the last purchased product
              { term: { productCode: lastPurchaseProduct.productCode } },
              // Exclude products from different categories (optional, comment out if you want cross-category recommendations)
              { bool: { must_not: { term: { category: lastPurchaseProduct.category } } } }
            ]
          }
        }
      }
    });

    res.json({
      success: true,
      lastPurchase: {
        productCode: lastPurchaseProduct.productCode,
        name: lastPurchaseProduct.name,
        category: lastPurchaseProduct.category,
        price: lastPurchaseProduct.price,
        purchaseDate: lastPurchaseProduct.purchase_date
      },
      recommendations: result.body.hits.hits.map(hit => ({
        productCode: hit._source.productCode,
        name: hit._source.name,
        description: hit._source.description,
        price: hit._source.price,
        category: hit._source.category,
        score: hit._score
      }))
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting recommendations'
    });
  }
});

module.exports = router;
