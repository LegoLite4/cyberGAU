FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 600000 \
 && npm config set maxsockets 3 \
 && ok=0 \
 && for i in 1 2 3 4 5 6; do \
      npm install && ok=1 && break; \
      echo "npm install retry ${i}"; \
      rm -rf node_modules; \
      sleep 8; \
    done \
 && test "$ok" = 1
COPY . .
RUN npx prisma generate && npm run build
EXPOSE 4000
CMD ["sh", "docker-entrypoint.sh"]
