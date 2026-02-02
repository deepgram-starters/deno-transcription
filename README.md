# Deno Transcription Starter

Get started with Deepgram's Speech-to-Text API using Deno and TypeScript.

## Features

- 🦕 **Native Deno**: Built with Deno's native HTTP server and TypeScript support
- 🎤 **Audio Transcription**: Upload files or provide URLs for transcription
- 🚀 **Hot Reload**: Automatic server restart in development mode
- 📦 **Zero Config**: No build step needed for backend code
- 🔒 **Type Safe**: Full TypeScript support with strict mode

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) v2.0 or higher
- [Node.js](https://nodejs.org/) v24+ (for frontend tooling)
- [pnpm](https://pnpm.io/) v10+ (managed via corepack)
- A Deepgram API key ([get one free](https://console.deepgram.com/signup))

### Installation

```bash
# Clone and initialize
git clone <repository-url>
cd deno-transcription
make init

# Configure environment
cp .env.example .env
# Edit .env and add your DEEPGRAM_API_KEY
```

### Development

```bash
# Start development servers (backend + frontend with hot reload)
make dev

# Open your browser to http://localhost:8080
```

### Production

```bash
# Build frontend and start production server
make build
make start
```

## Available Commands

```bash
make help              # Show all available commands
make init              # Initialize submodules and dependencies
make dev               # Start development servers
make start             # Start production server
make build             # Build frontend for production
make clean             # Remove build artifacts
make update            # Update frontend submodule
make status            # Show git and submodule status
```

## Project Structure

```
deno-transcription/
├── server.ts              # Main Deno server (TypeScript)
├── deno.json              # Deno configuration and tasks
├── deno.lock              # Dependency lock file
├── .env.example           # Environment template
├── deepgram.toml          # Project metadata
├── Makefile               # Development commands
├── frontend/              # Frontend submodule (HTML/JS)
│   ├── index.html
│   ├── src/
│   └── ...
└── README.md
```

## API Endpoints

### POST /stt/transcribe

Transcribe audio from a file upload or URL.

**Request (multipart/form-data):**
```typescript
// File upload
{
  file: File,
  model?: string  // default: "nova-3"
}

// OR URL
{
  url: string,
  model?: string  // default: "nova-3"
}
```

**Response:**
```json
{
  "transcript": "Your transcribed text here",
  "words": [...],
  "metadata": {
    "model_uuid": "...",
    "request_id": "...",
    "model_name": "nova-3"
  },
  "duration": 12.5
}
```

### GET /api/metadata

Returns metadata about this starter application.

**Response:**
```json
{
  "title": "Deno Transcription",
  "description": "...",
  "framework": "Deno",
  ...
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPGRAM_API_KEY` | (required) | Your Deepgram API key |
| `PORT` | 8080 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `VITE_PORT` | 8081 | Frontend dev server port |
| `NODE_ENV` | - | Set to "development" for dev mode |

### Deno Permissions

This application requires the following Deno permissions:

- `--allow-net`: HTTP server and Deepgram API calls
- `--allow-read`: Read .env, deepgram.toml, and static files
- `--allow-env`: Access environment variables

These are configured in `deno.json` tasks.

## Development

### Type Checking

```bash
deno task check
```

### Cache Dependencies

```bash
deno task cache
```

### Hot Reload

The `dev` task includes `--watch` flag for automatic reload on file changes.

## Architecture

This starter demonstrates:

- **Native Deno HTTP**: Uses `Deno.serve()` instead of Express
- **TypeScript First**: Full type safety with native TS support
- **Import Maps**: Clean imports via deno.json
- **npm Compatibility**: Uses Deepgram SDK from npm
- **Static Serving**: Development proxy and production static files

## Customization

### Adding Features

The code is organized into clear sections:

1. **Configuration** - Customize ports, models, etc.
2. **Helper Functions** - Add validation, formatting logic
3. **API Routes** - Add new endpoints
4. **Frontend Serving** - Modify dev/prod serving logic

### Deepgram Features

Add more Deepgram features by modifying the transcription options:

```typescript
const response = await deepgram.listen.prerecorded.transcribeUrl(
  { url: audioUrl },
  {
    model: "nova-3",
    smart_format: true,
    diarize: true,
    punctuate: true,
    // Add more features here
  }
);
```

See [Deepgram docs](https://developers.deepgram.com/docs) for all available features.

## Troubleshooting

### Vite dev server not running

Make sure frontend dependencies are installed:
```bash
cd frontend && corepack pnpm install
```

### Permission errors

Ensure you're running with the correct Deno permissions (see deno.json tasks).

### Module not found

Cache dependencies:
```bash
deno task cache
```

## Resources

- [Deepgram Documentation](https://developers.deepgram.com/docs)
- [Deno Documentation](https://docs.deno.com/)
- [Deepgram API Reference](https://developers.deepgram.com/reference)
- [Deno Standard Library](https://deno.land/std)

## License

MIT License - see LICENSE file for details

## Support

- [Deepgram Community](https://github.com/orgs/deepgram/discussions)
- [Deepgram Support](https://deepgram.com/contact-us)
- [File an Issue](https://github.com/deepgram-starters/deno-transcription/issues)
