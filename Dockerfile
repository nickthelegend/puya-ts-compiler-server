# Dockerfile - puya-ts compiler with local binary
FROM node:22-slim

ENV NODE_ENV=production
ENV USE_LOCAL_PUYA=1
ENV PUYA_BIN=puya-ts
ENV PUYA_PATH=/app/puya/puya 
ENV PATH=/usr/local/bin:$PATH

WORKDIR /app

# Minimal system deps (ca-certificates kept for HTTPS)
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl tar ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Download Puya binary and extract it
RUN mkdir -p /app/puya && \
    cd /app/puya && \
    curl -L -o puya.tar.gz https://nickthelegend.github.io/puya-mirror/src/puya-4.7.0-linux_x64.tar.gz && \
    tar -xzf puya.tar.gz && \
    chmod +x /app/puya/puya && \
    rm puya.tar.gz

# Install official puya-ts and Algorand TypeScript globally
RUN npm install -g @algorandfoundation/puya-ts@latest \
  && npm install -g @algorandfoundation/algorand-typescript

# Create non-root user
RUN useradd --system --uid 1002 --create-home --home-dir /home/app app \
  && mkdir -p /app && chown -R app:app /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy app source
COPY --chown=app:app server.js ./
RUN mkdir -p /app/tmp && chown -R app:app /app/tmp

USER app

EXPOSE 3000

CMD ["node", "server.js"]
