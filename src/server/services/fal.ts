import { fal } from '@fal-ai/client';

/**
 * Configure fal credentials from environment.
 * Never logs or exposes FAL_KEY.
 */
export function configureFal(): void {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    throw new Error('FAL_KEY secret is not configured in the AI Studio Secrets panel.');
  }
  fal.config({
    credentials: falKey,
  });
}

/**
 * Submit a job to the fal.ai queue.
 * Sends X-Fal-Object-Lifecycle-Preference with expiration_duration_seconds: null
 * so output files do not expire.
 */
export async function submit(
  endpointId: string,
  input: Record<string, any>
): Promise<{ requestId: string }> {
  configureFal();
  const res = await fal.queue.submit(endpointId, {
    input,
    headers: {
      'x-fal-object-lifecycle-preference': JSON.stringify({
        expiration_duration_seconds: null,
      }),
    },
  });
  return { requestId: res.request_id };
}

/**
 * Check the status of a queued or running job on fal.ai.
 */
export async function status(endpointId: string, requestId: string) {
  configureFal();
  return await fal.queue.status(endpointId as any, {
    requestId,
    logs: true,
  });
}

/**
 * Fetch the result of a completed job on fal.ai.
 */
export async function result(endpointId: string, requestId: string): Promise<any> {
  configureFal();
  return await fal.queue.result(endpointId as any, {
    requestId,
  });
}

/**
 * Upload a file buffer to fal storage and return the public URL.
 */
export async function upload(buffer: Buffer, mimeType: string, filename?: string): Promise<string> {
  configureFal();
  const uint8 = new Uint8Array(buffer);
  const blob = new Blob([uint8], { type: mimeType });
  if (filename) {
    (blob as any).name = filename;
  }
  return await fal.storage.upload(blob);
}
