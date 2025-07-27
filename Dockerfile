# Use Node.js 16 Alpine as base image
FROM node:16-alpine

<<<<<<< HEAD
# ✅ إضافة Python ومترجمات C/C++ المطلوبة لـ sqlite3
RUN apk add --no-cache python3 make g++ sqlite

=======
>>>>>>> origin/main
# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install production dependencies only
<<<<<<< HEAD
RUN npm install --omit=dev
=======
RUN npm ci --only=production
>>>>>>> origin/main

# Copy app source
COPY . .

# Expose port
EXPOSE 3008

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3008/health || exit 1

# Start the server
CMD [ "node", "index.js" ]
