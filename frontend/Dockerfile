# PieChat Frontend — Production Dockerfile (Next.js standalone)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove Capacitor android directory (not needed for web build)
RUN rm -rf android ios .capacitor

# Build-time env vars — overridden at docker-compose level
ARG NEXT_PUBLIC_MATRIX_BASE_URL
ARG NEXT_PUBLIC_AUTH_BASE_URL
ARG NEXT_PUBLIC_MATRIX_SERVER_NAME
ENV NEXT_PUBLIC_MATRIX_BASE_URL=$NEXT_PUBLIC_MATRIX_BASE_URL
ENV NEXT_PUBLIC_AUTH_BASE_URL=$NEXT_PUBLIC_AUTH_BASE_URL
ENV NEXT_PUBLIC_MATRIX_SERVER_NAME=$NEXT_PUBLIC_MATRIX_SERVER_NAME

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 3000
USER node
CMD ["npm", "start"]
