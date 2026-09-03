import { useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IDB } from '../utils/idbStore';
import { processUploadQueue } from '../utils/uploadEngine';

import type { ActiveSession } from '../types';

export function useS3AudioUpload() {
  const queryClient = useQueryClient();
  const sessionRef = useRef<ActiveSession | null>(null);

  // TanStack Query: Orphan Session Detection on App Boot
  const { data: orphanedSessions = [] } = useQuery({
    queryKey: ['orphanedAudioSessions'],
    queryFn: () => IDB.getOrphanedSessions(),
  });

  // Mutation: Start Session
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/s3/create-multipart', { method: 'POST' });
      const { uploadId, key } = await res.json();

      const newSession: ActiveSession = {
        uploadId,
        s3Key: key,
        completedParts: [],
      };
      await IDB.saveSession(newSession);
      sessionRef.current = newSession;
      return newSession;
    },
  });

  // Mutation: Complete Session
  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionRef.current) throw new Error('No active recording session');

      // Ensure local queue is completely drained
      sessionRef.current = await processUploadQueue(sessionRef.current);

      const pending = await IDB.getPendingChunks(sessionRef.current.uploadId);
      if (pending.length > 0) {
        // Trigger Background Sync Service Worker if user is offline
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const registration = await navigator.serviceWorker.ready;
          await registration.sync.register('s3-background-sync');
          throw new Error(
            'Offline: Remaining chunks delegated to Background Sync'
          );
        }
        throw new Error('Upload incomplete: Chunks remain in local queue');
      }

      // Complete Multipart Upload in S3
      const res = await fetch('/api/s3/complete-multipart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: sessionRef.current.uploadId,
          key: sessionRef.current.s3Key,
          parts: sessionRef.current.completedParts,
        }),
      });

      if (!res.ok) throw new Error('Failed to complete S3 upload');

      await IDB.clearSession(sessionRef.current.uploadId);
      sessionRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['orphanedAudioSessions'] });
    },
  });

  /**
   * Handles a 5MB audio chunk that is ready for upload.
   * Saves the chunk to IndexedDB and processes the upload queue.
   *
   * @async
   * @param {Blob} blob - The 5MB audio chunk to be uploaded.
   * @param {number} partNumber - The part number of the chunk within the multipart upload.
   * @returns {*}
   */
  const handle5MBPartReady = async (blob: Blob, partNumber: number) => {
    if (!sessionRef.current) return;

    // 1. Write immediately to IDB Queue
    await IDB.saveChunk(sessionRef.current.uploadId, partNumber, blob);

    // 2. Process Queue with Lock Mutex
    sessionRef.current = await processUploadQueue(sessionRef.current);
  };

  // Process queue when browser regains network
  useEffect(() => {
    const handleOnline = async () => {
      if (sessionRef.current) {
        sessionRef.current = await processUploadQueue(sessionRef.current);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return {
    startSession: startSessionMutation.mutateAsync,
    completeSession: completeSessionMutation.mutateAsync,
    handle5MBPartReady,
    orphanedSessions,
    isCompleting: completeSessionMutation.isPending,
  };
}
