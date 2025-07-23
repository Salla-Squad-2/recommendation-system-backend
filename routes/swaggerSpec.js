// swaggerSpec.js
const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Recommendation System API',
      version: '1.0.0',
      description: 'A smart engine that provides smart recommendations.',
    },
    servers: [
      {
        url: 'http://localhost:3001',
      },
    ],
  },
  apis: ['./routes/*.js'], // مسارات ملفات الراوتر اللي فيها توثيق
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
