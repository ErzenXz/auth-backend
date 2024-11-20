# Dockerfile for Building and Running a XENSystem
## This Dockerfile defines a multi-stage build process for a Node.js application using the Alpine Linux distribution for a lightweight image. It sets up the application environment, installs dependencies, generates Prisma client code, builds the application, and configures the runtime environment.

### Build Stage
FROM node:20.18.0-alpine3.19 AS build

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Allow scripts to run for native module compilation
RUN yarn install

COPY . .

RUN yarn prisma generate && yarn build

### Production Stage

FROM node:20.18.0-alpine3.19 AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app ./

# Install only production dependencies without running scripts
RUN yarn install --production --ignore-scripts

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Change ownership to the non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "dist/main"]