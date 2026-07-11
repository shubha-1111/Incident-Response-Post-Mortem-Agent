# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package configurations, npm config, and build definitions
COPY package*.json .npmrc tsconfig.json ./
RUN npm install

# Copy the entire workspace files
COPY . .

# Compile backend and frontend layers
RUN npm run build

# Stage 2: Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and npm config, then install production-only dependencies
COPY package*.json .npmrc ./
RUN npm install --only=production

# Copy built backend files
COPY --from=builder /app/dist ./dist

# Copy minified frontend static assets
COPY --from=builder /app/src/frontend/dist ./src/frontend/dist

# Expose backend port
EXPOSE 3001

# Start the server
CMD ["npm", "run", "start"]
