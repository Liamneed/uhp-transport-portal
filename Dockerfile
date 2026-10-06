FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

# Public frontend build configuration only.
# Production secrets must remain runtime environment variables.
ARG VITE_MAP_TILE_ATTRIBUTION
ARG VITE_MAP_TILE_URL

RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV DATA_DIR=/app/data

EXPOSE 3001

CMD ["npm", "run", "start"]
