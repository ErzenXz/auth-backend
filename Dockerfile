FROM node:20.18.0-alpine3.19 AS build

WORKDIR /app

COPY package*.json ./

RUN yarn install

COPY . .

RUN yarn prisma generate && yarn build

ENV NODE_ENV=production

RUN yarn install --production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "dist/main"]