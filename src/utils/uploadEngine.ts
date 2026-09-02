import { IDB } from './idbStore';
import type { ActiveSession } from '../types';

/**
 *  Fetches a presigned URL for a specific part of an S3 multipart upload and uploads the provided blob to that URL.
 * If the upload fails, it retries the operation with exponential backoff up to a specified number of attempts.
 *
 * @param blob - The Blob data to be uploaded.
 * @param partNumber - The part number of the multipart upload.
 * @param uploadId - The unique identifier for the multipart upload session.
 * @param key - The S3 object key where the part will be uploaded.
 * @param maxRetries - The maximum number of retry attempts in case of failure (default is 3).
 * @returns - A promise that resolves to an object containing the ETag and PartNumber of the uploaded part.
 */
export async function uploadPartWithRetry(
  blob: Blob,
  partNumber: number,
  uploadId: string,
  key: string,
  maxRetries = 3
): Promise<{ ETag: string; PartNumber: number }> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // 1. Get presigned URL
      const preSignRes = await fetch('/api/s3/presign-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, key, partNumber }),
      });
      if (!preSignRes.ok) throw new Error('Failed presigned URL');
      const { presignedUrl } = await preSignRes.json();

      // 2. Upload to S3
      const s3Res = await fetch(presignedUrl, { method: 'PUT', body: blob });
      if (!s3Res.ok) throw new Error(`S3 Error: ${s3Res.status}`);

      const etag = s3Res.headers.get('ETag');
      if (!etag) throw new Error('Missing ETag header');

      return { ETag: etag.replace(/"/g, ''), PartNumber: partNumber };
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Upload retries exhausted');
}

/**
 * A single threaded safe queue processor that handles the upload of audio chunks to S3 using the Web Locks API.
 * It ensures that only one tab can process the upload queue for a given session at a time, preventing race conditions and ensuring data integrity.
 *
 * @param session - The active session containing the upload ID, S3 key, and completed parts.
 * @returns - A promise that resolves to the updated active session after processing the upload queue.
 */
export async function processUploadQueue(
  session: ActiveSession
): Promise<ActiveSession> {
  let currentSession = { ...session };

  // Use Web Lock to prevent multi-tab concurrency race conditions
  if ('locks' in navigator) {
    await navigator.locks.request(
      `s3_lock_${session.uploadId}`,
      async (lock) => {
        if (!lock) return; // Another tab is actively uploading this session
        currentSession = await executeQueue(currentSession);
      }
    );
  } else {
    currentSession = await executeQueue(currentSession);
  }

  return currentSession;
}

/**
 * Executes the upload queue for a given session.
 *
 * @param session - The active session containing the upload ID, S3 key, and completed parts.
 * @returns - A promise that resolves to the updated active session after processing the upload queue.
 */
async function executeQueue(session: ActiveSession): Promise<ActiveSession> {
  const pending = await IDB.getPendingChunks(session.uploadId);

  for (const chunk of pending) {
    if (!navigator.onLine) break;

    const exists = session.completedParts.some(
      (p) => p.PartNumber === chunk.partNumber
    );

    if (exists) {
      await IDB.deleteChunk(chunk.uploadId, chunk.partNumber);
      continue;
    }

    try {
      const partResult = await uploadPartWithRetry(
        chunk.blob,
        chunk.partNumber,
        session.uploadId,
        session.s3Key
      );

      session.completedParts.push(partResult);
      await IDB.saveSession(session);
      await IDB.deleteChunk(chunk.uploadId, chunk.partNumber);
    } catch {
      console.warn(
        `Part ${chunk.partNumber} failed. Retaining in IndexedDB queue.`
      );
      break; // Pause loop on failure to retain chunk for later sync
    }
  }

  return session;
}
