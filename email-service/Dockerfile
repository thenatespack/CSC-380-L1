FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm i 
# Copy source
COPY email-manager.js ./

# Make executable
RUN chmod +x email-manager.js

EXPOSE 3000

CMD ["npm", "start"]

