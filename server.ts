/**
 * Deno Transcription Starter - Backend Server
 *
 * This is a simple Deno HTTP server that provides a transcription API endpoint
 * powered by Deepgram's Speech-to-Text service. It's designed to be easily
 * modified and extended for your own projects.
 *
 * Key Features:
 * - Single API endpoint: POST /stt/transcribe
 * - Accepts both file uploads and URLs
 * - Proxies to Vite dev server in development
 * - Serves static frontend in production
 * - Native TypeScript support
 * - No external web framework needed
 */

import { createClient } from "@deepgram/sdk";
import { load } from "dotenv";
import TOML from "npm:@iarna/toml@2.2.5";

// Load environment variables
await load({ export: true });

// ============================================================================
// CONFIGURATION - Customize these values for your needs
// ============================================================================

/**
 * Default transcription model to use when none is specified
 * Options: "nova-3", "nova-2", "nova", "enhanced", "base"
 * See: https://developers.deepgram.com/docs/models-languages-overview
 */
const DEFAULT_MODEL = "nova-3";

/**
 * Server configuration - These can be overridden via environment variables
 */
interface ServerConfig {
  port: number;
  host: string;
  vitePort: number;
  isDevelopment: boolean;
}

const config: ServerConfig = {
  port: parseInt(Deno.env.get("PORT") || "8080"),
  host: Deno.env.get("HOST") || "0.0.0.0",
  vitePort: parseInt(Deno.env.get("VITE_PORT") || "8081"),
  isDevelopment: Deno.env.get("NODE_ENV") === "development",
};

// ============================================================================
// API KEY LOADING - Load Deepgram API key from environment
// ============================================================================

/**
 * Loads the Deepgram API key from environment variables
 */
function loadApiKey(): string {
  const apiKey = Deno.env.get("DEEPGRAM_API_KEY");

  if (!apiKey) {
    console.error("\n❌ ERROR: Deepgram API key not found!\n");
    console.error("Please set your API key using one of these methods:\n");
    console.error("1. Create a .env file (recommended):");
    console.error("   DEEPGRAM_API_KEY=your_api_key_here\n");
    console.error("2. Environment variable:");
    console.error("   export DEEPGRAM_API_KEY=your_api_key_here\n");
    console.error("Get your API key at: https://console.deepgram.com\n");
    Deno.exit(1);
  }

  return apiKey;
}

const apiKey = loadApiKey();

// ============================================================================
// SETUP - Initialize Deepgram client
// ============================================================================

const deepgram = createClient(apiKey);

// ============================================================================
// TYPES - TypeScript interfaces for request/response
// ============================================================================

interface TranscriptionRequest {
  url?: string;
  buffer?: ArrayBuffer;
  mimetype?: string;
}

interface ErrorResponse {
  error: {
    type: "ValidationError" | "TranscriptionError";
    code: string;
    message: string;
    details: {
      originalError: string;
    };
  };
}

interface TranscriptionResponse {
  transcript: string;
  words: unknown[];
  metadata: {
    model_uuid?: string;
    request_id?: string;
    model_name: string;
  };
  duration?: number;
}

// ============================================================================
// HELPER FUNCTIONS - Modular logic for easier understanding and testing
// ============================================================================

/**
 * Validates that either a file or URL was provided in the request
 * @param file - File from form data
 * @param url - URL string from form data
 * @returns Request object for Deepgram, or null if invalid
 */
function validateTranscriptionInput(
  file: File | null,
  url: string | null
): TranscriptionRequest | null {
  // URL-based transcription
  if (url) {
    return { url };
  }

  // File-based transcription
  if (file) {
    return { buffer: new ArrayBuffer(0), mimetype: file.type };
  }

  // Neither provided
  return null;
}

/**
 * Sends a transcription request to Deepgram
 * @param dgRequest - Request object with url OR buffer+mimetype
 * @param model - Model name to use (e.g., "nova-3")
 * @returns Deepgram API response
 */
async function transcribeAudio(
  dgRequest: TranscriptionRequest,
  model: string = DEFAULT_MODEL
): Promise<unknown> {
  // URL transcription
  if (dgRequest.url) {
    return await deepgram.listen.prerecorded.transcribeUrl(
      { url: dgRequest.url },
      { model }
    );
  }

  // File transcription
  if (dgRequest.buffer) {
    // Convert ArrayBuffer to Buffer for Deepgram SDK
    const buffer = new Uint8Array(dgRequest.buffer);
    return await deepgram.listen.prerecorded.transcribeFile(buffer as any, {
      model,
      mimetype: dgRequest.mimetype,
    });
  }

  throw new Error("Invalid transcription request");
}

/**
 * Formats Deepgram's response into a simplified, consistent structure
 * @param transcriptionResponse - Raw Deepgram API response
 * @param modelName - Name of model used for transcription
 * @returns Formatted response object
 */
function formatTranscriptionResponse(
  transcriptionResponse: any,
  modelName: string
): TranscriptionResponse {
  const transcription = transcriptionResponse.result;
  const result = transcription?.results?.channels?.[0]?.alternatives?.[0];

  if (!result) {
    throw new Error("No transcription results returned from Deepgram");
  }

  // Build response object
  const response: TranscriptionResponse = {
    transcript: result.transcript || "",
    words: result.words || [],
    metadata: {
      model_uuid: transcription.metadata?.model_uuid,
      request_id: transcription.metadata?.request_id,
      model_name: modelName,
    },
  };

  // Add optional fields if available
  if (transcription.metadata?.duration) {
    response.duration = transcription.metadata.duration;
  }

  return response;
}

/**
 * Formats error responses in a consistent structure
 * @param error - The error that occurred
 * @param statusCode - HTTP status code to return
 * @param code - Error code
 * @returns Response object
 */
function formatErrorResponse(
  error: Error,
  statusCode: number = 500,
  code?: string
): Response {
  const errorBody: ErrorResponse = {
    error: {
      type: statusCode === 400 ? "ValidationError" : "TranscriptionError",
      code: code || (statusCode === 400 ? "MISSING_INPUT" : "TRANSCRIPTION_FAILED"),
      message: error.message || "An error occurred during transcription",
      details: {
        originalError: error.toString(),
      },
    },
  };

  return Response.json(errorBody, { status: statusCode });
}

// ============================================================================
// API ROUTE HANDLERS
// ============================================================================

/**
 * POST /stt/transcribe
 * Main transcription endpoint
 */
async function handleTranscription(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const url = formData.get("url") as string | null;
    const model = (formData.get("model") as string) || DEFAULT_MODEL;

    // Validate input - must have either file or URL
    const dgRequest = validateTranscriptionInput(file, url);
    if (!dgRequest) {
      return formatErrorResponse(
        new Error("Either file or url must be provided"),
        400,
        "MISSING_INPUT"
      );
    }

    // If file provided, read it into buffer
    if (file && dgRequest.buffer !== undefined) {
      dgRequest.buffer = await file.arrayBuffer();
    }

    // Send transcription request to Deepgram
    const transcriptionResponse = await transcribeAudio(dgRequest, model);

    // Format and return response
    const response = formatTranscriptionResponse(transcriptionResponse, model);
    return Response.json(response);
  } catch (err) {
    console.error("Transcription error:", err);
    return formatErrorResponse(err as Error);
  }
}

/**
 * GET /api/metadata
 * Returns metadata about this starter application
 */
async function handleMetadata(): Promise<Response> {
  try {
    const tomlContent = await Deno.readTextFile("./deepgram.toml");
    const config = TOML.parse(tomlContent);

    if (!config.meta) {
      return Response.json(
        {
          error: "INTERNAL_SERVER_ERROR",
          message: "Missing [meta] section in deepgram.toml",
        },
        { status: 500 }
      );
    }

    return Response.json(config.meta);
  } catch (error) {
    console.error("Error reading metadata:", error);
    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to read metadata from deepgram.toml",
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// FRONTEND SERVING - Development proxy or production static files
// ============================================================================

/**
 * Get content type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };
  return types[ext || ""] || "application/octet-stream";
}

/**
 * Serve static file from frontend/dist
 */
async function serveStaticFile(pathname: string): Promise<Response> {
  const filePath = pathname === "/"
    ? "./frontend/dist/index.html"
    : `./frontend/dist${pathname}`;

  try {
    const file = await Deno.readFile(filePath);
    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: { "content-type": contentType },
    });
  } catch {
    // Return index.html for SPA routing (404s -> index.html)
    try {
      const index = await Deno.readFile("./frontend/dist/index.html");
      return new Response(index, {
        headers: { "content-type": "text/html" },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }
}

/**
 * Handle frontend requests - proxy to Vite in dev, serve static in prod
 */
async function handleFrontend(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (config.isDevelopment) {
    // Proxy to Vite dev server
    const viteUrl = `http://localhost:${config.vitePort}${url.pathname}${url.search}`;

    try {
      const response = await fetch(viteUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      return response;
    } catch {
      return new Response(
        `Vite dev server not running on port ${config.vitePort}`,
        { status: 502 }
      );
    }
  }

  // Production mode - serve static files
  return serveStaticFile(url.pathname);
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // API Routes
  if (req.method === "POST" && url.pathname === "/stt/transcribe") {
    return handleTranscription(req);
  }

  if (req.method === "GET" && url.pathname === "/api/metadata") {
    return handleMetadata();
  }

  // Frontend (catch-all)
  return handleFrontend(req);
}

// ============================================================================
// SERVER START
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log(`🚀 Deno Transcription Server running at http://localhost:${config.port}`);
if (config.isDevelopment) {
  console.log(`📡 Proxying frontend from Vite dev server on port ${config.vitePort}`);
  console.log(`\n⚠️  Open your browser to http://localhost:${config.port}`);
} else {
  console.log(`📦 Serving built frontend from frontend/dist`);
}
console.log("=".repeat(70) + "\n");

Deno.serve({ port: config.port, hostname: config.host }, handleRequest);
