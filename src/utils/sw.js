// sw.js
import { IDB } from './idbStore';
import { uploadPartWithRetry } from './uploadEngine';

self.addEventListener('sync', (event) => {
  if (event.tag === 's3-background-sync') {
    event.waitUntil(syncPendingAudioChunks());
  }
});

/**
 * Synchronizes pending audio chunks stored in IndexedDB with S3.
 * This function retrieves all orphaned sessions and their associated pending chunks,
 * attempts to upload each chunk to S3, and updates the session state in IndexedDB accordingly.
 * If an upload fails, it logs the error and retains the chunk for future retry attempts.
 */
async function syncPendingAudioChunks() {
  const sessions = await IDB.getOrphanedSessions();

  for (const session of sessions) {
    const pending = await IDB.getPendingChunks(session.uploadId);

    for (const chunk of pending) {
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
      } catch (err) {
        console.error(
          'Service worker upload failed, will retry next sync',
          err
        );
        break;
      }
    }
  }
}
