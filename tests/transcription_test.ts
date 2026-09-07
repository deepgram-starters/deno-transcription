import { assertEquals } from "jsr:@std/assert";
import { Buffer } from "node:buffer";
import { transcribeAudio } from "../transcription.ts";

Deno.test("preserves the uploaded MIME type for file transcription", async () => {
  let fileRequest: unknown;
  let options: unknown;
  const deepgram = {
    listen: {
      v1: {
        media: {
          transcribeFile: (request: unknown, requestOptions: unknown) => {
            fileRequest = request;
            options = requestOptions;
            return Promise.resolve({ results: {} });
          },
        },
      },
    },
  };

  await transcribeAudio(
    { buffer: Buffer.from([0, 1, 2]), mimetype: "audio/wav" },
    deepgram,
    "nova-3",
  );

  assertEquals(fileRequest, { data: Buffer.from([0, 1, 2]), contentType: "audio/wav" });
  assertEquals(options, { model: "nova-3" });
});
