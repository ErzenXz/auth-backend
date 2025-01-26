# Dockerfile for Building and Running a XENSystem
## This Dockerfile defines a multi-stage build process for a Node.js application using the Alpine Linux distribution for a lightweight image. It sets up the application environment, installs dependencies, generates Prisma client code, builds the application, and configures the runtime environment.

### Build Stage
FROM node:20.18.0-alpine3.19 AS build

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache g++ make python3

COPY package*.json ./

# Allow scripts to run for native module compilation
RUN yarn install

COPY . .

RUN yarn prisma generate && yarn build

### Production Stage

FROM node:20.18.0-alpine3.19 AS production

RUN apk add --no-cache bash curl && curl -1sLf \
    'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash \
    && apk add --no-cache infisical


WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app ./

# Install only production dependencies without running scripts, create a non-root user, and change ownership
RUN yarn install --production --ignore-scripts && \
    addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

COPY script.sh /app/script.sh
RUN chmod +x /app/script.sh

USER appuser

EXPOSE 3000

CMD ["/app/script.sh"]