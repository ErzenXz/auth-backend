FROM node:20.18-alpine3.19 AS build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production

COPY .env .env

RUN npm ci --only=production

EXPOSE 3000

CMD ["node", "dist/main"]