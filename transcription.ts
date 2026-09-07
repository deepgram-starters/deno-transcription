import type { Buffer } from "node:buffer";

export interface TranscriptionRequest {
  url?: string;
  buffer?: Buffer;
  mimetype?: string;
}

export async function transcribeAudio(
  request: TranscriptionRequest,
  deepgram: any,
  model: string,
): Promise<unknown> {
  if (request.url) {
    return await deepgram.listen.v1.media.transcribeUrl({ url: request.url, model });
  }

  if (request.buffer) {
    return await deepgram.listen.v1.media.transcribeFile(
      { data: request.buffer, contentType: request.mimetype },
      { model },
    );
  }

  throw new Error("Invalid transcription request");
}
