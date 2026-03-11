# PieChat Auth Service — Production Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Install runtime deps for better-sqlite3
RUN apk add --no-cache python3 make g++
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev && apk del python3 make g++
COPY --from=builder /app/dist/ ./dist/

EXPOSE 4000
USER node
CMD ["node", "dist/index.js"]
