import { set, get, del, entries } from 'idb-keyval';
import type { ActiveSession, StoredChunk } from '../types';

export const IDB = {
  /**
   * Saves an active session to IndexedDB.
   *
   * @param session - The active session to save.
   */
  async saveSession(session: ActiveSession) {
    await set(`session_${session.uploadId}`, session);
  },

  /**
   * Retrieves an active session from IndexedDB based on the provided upload ID.
   * @param uploadId - The unique identifier for the upload session.
   * @returns
   */
  async getSession(uploadId: string): Promise<ActiveSession | undefined> {
    return await get(`session_${uploadId}`);
  },

  /**
   * Saves a chunk of audio data to IndexedDB.
   * @param uploadId - The unique identifier for the upload session.
   * @param partNumber - The part number of the chunk.
   * @param blob - The blob containing the audio data.
   */
  async saveChunk(uploadId: string, partNumber: number, blob: Blob) {
    const record: StoredChunk = { uploadId, partNumber, blob };
    await set(`chunk_${uploadId}_part_${partNumber}`, record);
  },

  /**
   * Deletes a specific chunk of audio data from IndexedDB based on the provided upload ID and part number.
   * @param uploadId - The unique identifier for the upload session.
   * @param partNumber - The part number of the chunk to delete.
   */
  async deleteChunk(uploadId: string, partNumber: number) {
    await del(`chunk_${uploadId}_part_${partNumber}`);
  },

  /**
   * Retrieves all pending chunks for a specific upload session from IndexedDB.
   * @param uploadId - The unique identifier for the upload session.
   * @returns - An array of stored chunks sorted by part number.
   */
  async getPendingChunks(uploadId: string): Promise<StoredChunk[]> {
    const all = await entries();
    return all
      .filter(
        ([k]) =>
          typeof k === 'string' && k.startsWith(`chunk_${uploadId}_part_`)
      )
      .map(([_, v]) => v as StoredChunk)
      .sort((a, b) => a.partNumber - b.partNumber);
  },

  /**
   * Retrieves all orphaned sessions from IndexedDB.
   * An orphaned session is defined as a session that has been saved but does not have any associated chunks.
   * @returns - An array of active sessions that are considered orphaned.
   */
  async getOrphanedSessions(): Promise<ActiveSession[]> {
    const all = await entries();
    const uploadIdsWithChunks = new Set(
      all
        .filter(([key]) => typeof key === 'string' && key.startsWith('chunk_'))
        .map(([_, value]) => (value as StoredChunk).uploadId)
    );

    return all
      .filter(([k]) => typeof k === 'string' && k.startsWith('session_'))
      .map(([_, v]) => v as ActiveSession)
      .filter((session) => !uploadIdsWithChunks.has(session.uploadId));
  },

  /**
   * Clears all data associated with a specific upload session from IndexedDB.
   * @param uploadId - The unique identifier for the upload session.
   */
  async clearSession(uploadId: string) {
    const all = await entries();
    for (const [key] of all) {
      if (
        key === `session_${uploadId}` ||
        (typeof key === 'string' && key.startsWith(`chunk_${uploadId}_part_`))
      ) {
        await del(key);
      }
    }
  },
};
