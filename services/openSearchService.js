const axios = require('axios');

const OPENSEARCH_SERVICE_URL = process.env.OPENSEARCH_SERVICE_URL || 'http://localhost:3001';

class OpenSearchService {
    // Get similar products based on vectors (Content-based recommendations)
    async getSimilarProducts(params) {
        try {
            const { productCode, limit = 100 } = params;
            const response = await axios.post(`${OPENSEARCH_SERVICE_URL}/similar-products`, {
                productCode,
                limit
            });
            return response.data;
        } catch (error) {
            console.error('Error getting similar products:', error.message);
            throw error;
        }
    }

    // Get frequently bought together products
    async getFrequentlyBoughtTogether(params) {
        try {
            const { productCode, limit = 10 } = params;
            const response = await axios.post(`${OPENSEARCH_SERVICE_URL}/frequently-bought`, {
                productCode,
                limit
            });
            return response.data;
        } catch (error) {
            console.error('Error getting frequently bought products:', error.message);
            throw error;
        }
    }

    // Get customer purchase history
    async getCustomerPurchaseHistory(params) {
        try {
            const { customerId, limit = 50 } = params;
            const response = await axios.post(`${OPENSEARCH_SERVICE_URL}/customer-history`, {
                customerId,
                limit
            });
            return response.data;
        } catch (error) {
            console.error('Error getting customer purchase history:', error.message);
            throw error;
        }
    }

    // Get personalized recommendations for a customer
    async getPersonalizedRecommendations(params) {
        try {
            const { customerId, limit = 10 } = params;
            const response = await axios.post(`${OPENSEARCH_SERVICE_URL}/personalized-recommendations`, {
                customerId,
                limit
            });
            return response.data;
        } catch (error) {
            console.error('Error getting personalized recommendations:', error.message);
            throw error;
        }
    }
}

module.exports = new OpenSearchService();
