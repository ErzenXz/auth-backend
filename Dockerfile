# Dockerfile for Building and Running a XENSystem
## This Dockerfile defines a multi-stage build process for a Node.js application using the Alpine Linux distribution for a lightweight image. It sets up the application environment, installs dependencies, generates Prisma client code, builds the application, and configures the runtime environment.

### Build Stage
FROM node:20.18.0-alpine3.19 AS build

WORKDIR /app

COPY package*.json ./

RUN yarn install --ignore-scripts

COPY . .

RUN yarn prisma generate && yarn build

### Production Stage

FROM node:20.18.0-alpine3.19 AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app ./

RUN yarn install --production --ignore-scripts

RUN yarn add bcrypt

RUN yarn rebuild bcrypt

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "dist/main"]