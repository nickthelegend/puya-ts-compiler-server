# Dockerfile - puya-ts compiler with node-slim
FROM node:22-slim

ENV NODE_ENV=production
ENV USE_LOCAL_PUYA=1
ENV PATH=/usr/local/bin:$PATH

WORKDIR /app

# Install dependencies including Python and pipx
RUN apt-get update && \
    apt-get install -y curl ca-certificates python3 python3-pip python3-venv && \
    python3 -m pip install --user --break-system-packages pipx && \
    python3 -m pipx ensurepath && \
    rm -rf /var/lib/apt/lists/*

# Update PATH to include pipx binaries
ENV PATH="/root/.local/bin:$PATH"

# Install AlgoKit via pipx
RUN pipx install algokit

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

# Pre-seed /tmp with package.json and node_modules for puya-ts
RUN mkdir -p /tmp/puya-template
COPY package.json /tmp/puya-template/
RUN cd /tmp/puya-template && npm install @algorandfoundation/algorand-typescript
RUN mkdir -p /app/tmp

EXPOSE 3000

CMD ["node", "server.js"]
