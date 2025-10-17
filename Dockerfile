# Dockerfile - puya-ts compiler with Ubuntu base
FROM ubuntu:22.04

ENV NODE_ENV=production
ENV USE_LOCAL_PUYA=1
ENV PUYA_BIN=/app/puya/puya 
ENV PATH=/usr/local/bin:$PATH
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install Node.js 22 and dependencies
RUN apt-get update && \
    apt-get install -y curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Download Puya binary and extract it
RUN mkdir -p /app/puya && \
    cd /app/puya && \
    curl -L -o puya.tar.gz https://nickthelegend.github.io/puya-mirror/src/puya-4.7.0-linux_x64.tar.gz && \
    tar -xzf puya.tar.gz && \
    chmod +x /app/puya/puya && \
    rm puya.tar.gz

# Install puya-ts globally
RUN npm install -g @algorandfoundation/puya-ts

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
RUN npm ci

# Install algorand-typescript locally
RUN npm install @algorandfoundation/algorand-typescript

# Copy app source
COPY server.js ./
RUN mkdir -p /app/tmp

EXPOSE 3000

CMD ["node", "server.js"]
