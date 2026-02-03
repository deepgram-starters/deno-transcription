/**
 * Deno Transcription Starter - Backend API Server
 *
 * This is a simple Deno HTTP server that provides a transcription API endpoint
 * powered by Deepgram's Speech-to-Text service. It's designed to be easily
 * modified and extended for your own projects.
 *
 * Key Features:
 * - Single API endpoint: POST /stt/transcribe
 * - Accepts both file uploads and URLs
 * - CORS-enabled for frontend communication
 * - Native TypeScript support
 * - No external web framework needed
 */

import { createClient } from "@deepgram/sdk";
import { load } from "dotenv";
import TOML from "npm:@iarna/toml@2.2.5";
import { Buffer } from "node:buffer";

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
  frontendPort: number;
}

const config: ServerConfig = {
  port: parseInt(Deno.env.get("PORT") || "8081"),
  host: Deno.env.get("HOST") || "0.0.0.0",
  frontendPort: parseInt(Deno.env.get("FRONTEND_PORT") || "8080"),
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
  buffer?: Buffer;
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

  // File-based transcription - return empty object with mimetype
  // Buffer will be populated later in the handler
  if (file) {
    return { mimetype: file.type };
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
    return await deepgram.listen.prerecorded.transcribeFile(dgRequest.buffer, {
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
 * Get CORS headers for API responses
 */
function getCorsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": `http://localhost:${config.frontendPort}`,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
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

  return Response.json(errorBody, {
    status: statusCode,
    headers: getCorsHeaders(),
  });
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

    console.log("=== Transcription Request ===");
    console.log("Has file:", !!file, file ? `(name: ${file.name}, size: ${file.size}, type: ${file.type})` : "");
    console.log("Has URL:", !!url, url || "");
    console.log("Model:", model);

    // Validate input - must have either file or URL
    const dgRequest = validateTranscriptionInput(file, url);
    if (!dgRequest) {
      return formatErrorResponse(
        new Error("Either file or url must be provided"),
        400,
        "MISSING_INPUT"
      );
    }

    console.log("Validation passed, dgRequest:", { hasUrl: !!dgRequest.url, hasMimetype: !!dgRequest.mimetype, hasBuffer: !!dgRequest.buffer });

    // If file provided, read it into buffer
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      // Convert to Node.js Buffer for SDK compatibility
      dgRequest.buffer = Buffer.from(arrayBuffer);
      console.log(`File read successfully: ${file.name}, buffer size: ${dgRequest.buffer.length} bytes, mimetype: ${dgRequest.mimetype}`);
    }

    // Send transcription request to Deepgram
    const transcriptionResponse = await transcribeAudio(dgRequest, model);

    // Debug logging
    console.log("Deepgram response structure:", JSON.stringify(transcriptionResponse, null, 2));

    // Format and return response
    const response = formatTranscriptionResponse(transcriptionResponse, model);
    return Response.json(response, { headers: getCorsHeaders() });
  } catch (err) {
    console.error("Transcription error:", err);
    // Log more details about the error
    if (err instanceof Error) {
      console.error("Error stack:", err.stack);
    }
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
        { status: 500, headers: getCorsHeaders() }
      );
    }

    return Response.json(config.meta, { headers: getCorsHeaders() });
  } catch (error) {
    console.error("Error reading metadata:", error);
    return Response.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to read metadata from deepgram.toml",
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

// ============================================================================
// CORS PREFLIGHT HANDLER
// ============================================================================

/**
 * Handle CORS preflight OPTIONS requests
 */
function handlePreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handlePreflight();
  }

  // API Routes
  if (req.method === "POST" && url.pathname === "/stt/transcribe") {
    return handleTranscription(req);
  }

  if (req.method === "GET" && url.pathname === "/api/metadata") {
    return handleMetadata();
  }

  // 404 for all other routes
  return Response.json(
    { error: "Not Found", message: "Endpoint not found" },
    { status: 404, headers: getCorsHeaders() }
  );
}

// ============================================================================
// SERVER START
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log(`🚀 Backend API Server running at http://localhost:${config.port}`);
console.log(`📡 CORS enabled for http://localhost:${config.frontendPort}`);
console.log(`\n💡 Frontend should be running on http://localhost:${config.frontendPort}`);
console.log("=".repeat(70) + "\n");

Deno.serve({ port: config.port, hostname: config.host }, handleRequest);
