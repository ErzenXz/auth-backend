FROM node:20.18-alpine3.19 AS build

WORKDIR /app

COPY package*.json ./

RUN yarn install

COPY . .

RUN yarn prisma generate

RUN yarn build

ENV NODE_ENV=production

RUN yarn install --production

EXPOSE 3000

CMD ["node", "dist/main"]