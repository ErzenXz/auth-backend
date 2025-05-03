#########################################
# Stage 1: install production dependencies
#########################################
FROM node:20.18.0-alpine3.19 AS deps
WORKDIR /app

# copy just the lockfile + manifest and install prod deps
COPY package.json yarn.lock ./
RUN yarn install \
    --frozen-lockfile \
    --production \
    && yarn cache clean

#########################################
# Stage 2: install all deps & build
#########################################
FROM node:20.18.0-alpine3.19 AS build
WORKDIR /app

# bring in build tools
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++

# copy manifest & lock, install everything (prod+dev)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile \
    && yarn cache clean

# copy source & generate + build
COPY . .
RUN yarn prisma generate \
    && yarn build

# remove build tools
RUN apk del .build-deps

#########################################
# Stage 3: final production image
#########################################
FROM node:20.18.0-alpine3.19 AS production
WORKDIR /app
ENV NODE_ENV=production

# install Infisical CLI → remove bash+curl
RUN apk add --no-cache bash curl \
    && curl -1sLf \
    "https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh" \
    | bash \
    && apk add --no-cache infisical \
    && apk del bash curl

# 1) bring in prod deps
COPY --from=deps  /app/node_modules   ./node_modules

# 2) overwrite Prisma artifacts
COPY --from=build /app/node_modules/@prisma   ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma    ./node_modules/.prisma

# 3) copy dist
COPY --from=build /app/dist                ./dist

# 4) copy your scripts + manifest
COPY --from=build /app/package.json        ./package.json
COPY --from=build /app/yarn.lock           ./yarn.lock
COPY    script.sh                          ./
RUN chmod +x script.sh

# drop privileges
RUN addgroup -S appgrp \
    && adduser  -S appusr -G appgrp \
    && chown -R appusr:appgrp /app
USER appusr

EXPOSE 3000
ENTRYPOINT ["./script.sh"]