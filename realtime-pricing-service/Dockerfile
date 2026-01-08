FROM node:18-alpine AS base

WORKDIR /app

COPY package*.json ./

FROM base AS deps
RUN npm ci --only=production

FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

USER nodejs

EXPOSE 8080

CMD ["node", "dist/index.js"]
