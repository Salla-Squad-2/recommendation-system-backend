const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit ({
  windowMs: 15 * 60 * 1000,
  max: 5 ,
  massage : {
    status: 429 ,
    message : 'The number of attempts is high! Try again after 15 minutes.'

  },
  standardHeaders: true,
  legacyHeaders: false 
});
module.exports ={
    authLimiter
};