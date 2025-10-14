# Dockerfile - puya-ts global install, non-root runtime
FROM node:22-slim

ENV NODE_ENV=production
ENV USE_LOCAL_PUYA=0
ENV PUYA_BIN=puya-ts
# ensure global npm bins are discoverable
ENV PATH=/usr/local/bin:$PATH

WORKDIR /app

# Minimal system deps (ca-certificates kept for HTTPS)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install official puya-ts globally
RUN npm install -g @algorandfoundation/puya-ts@latest

# Create non-root user and prepare workspace
RUN useradd --system --uid 1002 --create-home --home-dir /home/app app \
  && mkdir -p /app && chown -R app:app /app

# Copy package and install production deps
COPY package.json package-lock.json* ./
RUN npm ci
# Copy app and set ownership for non-root user
COPY --chown=app:app server.js ./

USER app

EXPOSE 3000

CMD ["node", "server.js"]
