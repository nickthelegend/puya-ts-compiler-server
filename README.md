# Puya TypeScript Compiler Server

A containerized HTTP server for compiling Algorand smart contracts written in TypeScript using the Puya compiler. This server provides a REST API to compile TypeScript contracts and returns ARC32/ARC56 artifacts.

## Features

- 🚀 **Fast Compilation** - Pre-seeded dependencies for quick builds
- 🐳 **Docker Ready** - Containerized for easy deployment
- 📦 **ARC Standards** - Returns ARC32 and ARC56 JSON artifacts
- 🔒 **Secure** - Isolated compilation in temporary directories
- 🧹 **Auto Cleanup** - Automatic cleanup of temporary files

## Quick Start

### Using Docker

```bash
# Build the container
docker build -t puya-compiler-server .

# Run the server
docker run -p 3000:3000 puya-compiler-server
```

### Local Development

```bash
# Install dependencies
npm install

# Install puya-ts globally
npm install -g @algorandfoundation/puya-ts

# Start the server
node server.js
```

## API Usage

### Compile Contract

**POST** `/compile`

**Request Body:**
```json
{
  "filename": "HelloWorld.algo.ts",
  "code": "import { Contract } from '@algorandfoundation/algorand-typescript'\\n\\nexport class HelloWorld extends Contract {\\n  public hello(name: string): string {\\n    return `${this.getHello()} ${name}`\\n  }\\n\\n  private getHello() {\\n    return 'Hello'\\n  }\\n}"
}
```

**Response:**
```json
{
  "ok": true,
  "files": {
    "HelloWorld.arc32.json": {
      "encoding": "utf8",
      "data": "{...}"
    },
    "HelloWorld.arc56.json": {
      "encoding": "utf8",
      "data": "{...}"
    }
  }
}
```

### Example with cURL

```bash
curl -X POST http://localhost:3000/compile \
  -H "Content-Type: application/json" \
  -d @test-payload.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `PUYA_TIMEOUT_MS` | `20000` | Compilation timeout in milliseconds |
| `BODY_LIMIT` | `2mb` | Maximum request body size |

## Architecture

### Docker Container
- **Base Image:** `node:22-slim`
- **Puya Binary:** Pre-installed from official releases
- **Dependencies:** Pre-seeded in `/tmp/puya-template`
- **Security:** Runs as root (configurable)

### Compilation Process
1. Receives TypeScript contract code via HTTP POST
2. Creates isolated temporary directory
3. Copies pre-seeded `node_modules` for fast dependency resolution
4. Runs `puya-ts` compiler with proper module resolution
5. Extracts ARC32/ARC56 artifacts from output
6. Returns compiled artifacts and cleans up

## Project Structure

```
puya-ts-compiler-server/
├── Dockerfile              # Container configuration
├── server.js              # Main server application
├── package.json           # Node.js dependencies
├── tsconfig.json          # TypeScript configuration
├── test-payload.json      # Example test payload
├── clean.sh              # Docker cleanup script
└── README.md             # This file
```

## Contributing

### Prerequisites

- Node.js 22+
- Docker
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd puya-ts-compiler-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install puya-ts globally**
   ```bash
   npm install -g @algorandfoundation/puya-ts
   ```

4. **Run locally**
   ```bash
   node server.js
   ```

### Testing

```bash
# Test with sample payload
curl -X POST http://localhost:3000/compile \
  -H "Content-Type: application/json" \
  -d @test-payload.json
```

### Docker Development

```bash
# Build container
docker build -t puya-compiler-server .

# Run container
docker run -p 3000:3000 puya-compiler-server

# Clean up containers
./clean.sh
```

### Code Style

- Use ES modules (`import`/`export`)
- Follow existing error handling patterns
- Add proper cleanup for temporary resources
- Include meaningful console logs for debugging

### Submitting Changes

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test thoroughly**
   - Test compilation with various TypeScript contracts
   - Verify Docker build and run
   - Check error handling
5. **Commit with clear messages**
   ```bash
   git commit -m "feat: add support for XYZ"
   ```
6. **Push and create Pull Request**

### Issue Reporting

When reporting issues, please include:
- TypeScript contract code that fails
- Full error message and stack trace
- Docker/Node.js version information
- Steps to reproduce

### Feature Requests

For new features, please:
- Open an issue first to discuss the feature
- Explain the use case and benefits
- Consider backward compatibility

## License

MIT License - see LICENSE file for details.

## Support

For questions and support:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the Puya documentation