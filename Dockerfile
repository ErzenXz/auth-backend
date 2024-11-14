# Use Node.js 20.18 on Alpine Linux as the base image
FROM node:20.18-alpine3.19 AS build

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Start a new stage to create a production image
FROM node:20.18-alpine3.19 AS production

# Set working directory
WORKDIR /app

# Copy only the built files and necessary dependencies from the build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY .env .env

# Set environment variable
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]