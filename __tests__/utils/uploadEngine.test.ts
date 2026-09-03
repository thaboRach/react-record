import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDB } from '../../src/utils/idbStore';
import {
  processUploadQueue,
  uploadPartWithRetry,
} from '../../src/utils/uploadEngine';
import type { ActiveSession, StoredChunk } from '../../src/types';

vi.mock('../../src/utils/idbStore', () => ({
  IDB: {
    deleteChunk: vi.fn(),
    getPendingChunks: vi.fn(),
    saveSession: vi.fn(),
  },
}));

const mockedDeleteChunk = vi.mocked(IDB.deleteChunk);
const mockedGetPendingChunks = vi.mocked(IDB.getPendingChunks);
const mockedSaveSession = vi.mocked(IDB.saveSession);
const mockedFetch = vi.fn<typeof fetch>();

const session: ActiveSession = {
  uploadId: 'upload-1',
  s3Key: 'recordings/audio.webm',
  completedParts: [],
};

function createChunk(partNumber: number): StoredChunk {
  return {
    uploadId: session.uploadId,
    partNumber,
    blob: new Blob([`part-${partNumber}`]),
  };
}

function presignedResponse(partNumber: number) {
  return new Response(
    JSON.stringify({ presignedUrl: `https://s3.test/part-${partNumber}` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function uploadResponse(etag: string) {
  return new Response(null, { status: 200, headers: { ETag: etag } });
}

describe('uploadPartWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockedFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should upload a part using a presigned URL and return its normalized ETag', async () => {
    const blob = new Blob(['audio']);
    mockedFetch
      .mockResolvedValueOnce(presignedResponse(2))
      .mockResolvedValueOnce(uploadResponse('"etag-2"'));

    await expect(
      uploadPartWithRetry(blob, 2, 'upload-1', session.s3Key)
    ).resolves.toEqual({ ETag: 'etag-2', PartNumber: 2 });

    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/s3/presign-part', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: 'upload-1',
        key: session.s3Key,
        partNumber: 2,
      }),
    });
    expect(mockedFetch).toHaveBeenNthCalledWith(2, 'https://s3.test/part-2', {
      method: 'PUT',
      body: blob,
    });
  });

  it('should retry a failed attempt and resolve when a later attempt succeeds', async () => {
    vi.useFakeTimers();
    mockedFetch
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(presignedResponse(3))
      .mockResolvedValueOnce(uploadResponse('etag-3'));

    const upload = uploadPartWithRetry(
      new Blob(['audio']),
      3,
      'upload-1',
      session.s3Key
    );
    await vi.runAllTimersAsync();

    await expect(upload).resolves.toEqual({ ETag: 'etag-3', PartNumber: 3 });
    expect(mockedFetch).toHaveBeenCalledTimes(3);
  });

  it('should propagate the final error after exhausting the retry limit', async () => {
    vi.useFakeTimers();
    const finalError = new Error('still unavailable');
    mockedFetch
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockRejectedValueOnce(finalError);

    const upload = uploadPartWithRetry(
      new Blob(['audio']),
      1,
      'upload-1',
      session.s3Key,
      2
    );
    const rejection = expect(upload).rejects.toBe(finalError);
    await vi.runAllTimersAsync();

    await rejection;
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('should reject an upload response without an ETag', async () => {
    mockedFetch
      .mockResolvedValueOnce(presignedResponse(1))
      .mockResolvedValueOnce(uploadResponse(''));

    await expect(
      uploadPartWithRetry(new Blob(['audio']), 1, 'upload-1', session.s3Key, 1)
    ).rejects.toThrow('Missing ETag header');
  });
});

describe('processUploadQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockedFetch);
    vi.stubGlobal('navigator', { onLine: true });
    mockedGetPendingChunks.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should upload pending chunks and persist progress after each part', async () => {
    const partOne = createChunk(1);
    const partTwo = createChunk(2);
    mockedGetPendingChunks.mockResolvedValue([partOne, partTwo]);
    mockedFetch
      .mockResolvedValueOnce(presignedResponse(1))
      .mockResolvedValueOnce(uploadResponse('etag-1'))
      .mockResolvedValueOnce(presignedResponse(2))
      .mockResolvedValueOnce(uploadResponse('etag-2'));

    const result = await processUploadQueue({ ...session, completedParts: [] });

    expect(result.completedParts).toEqual([
      { ETag: 'etag-1', PartNumber: 1 },
      { ETag: 'etag-2', PartNumber: 2 },
    ]);
    expect(mockedSaveSession).toHaveBeenCalledTimes(2);
    expect(mockedDeleteChunk).toHaveBeenNthCalledWith(1, 'upload-1', 1);
    expect(mockedDeleteChunk).toHaveBeenNthCalledWith(2, 'upload-1', 2);
  });

  it('should delete an already completed chunk without uploading it again', async () => {
    mockedGetPendingChunks.mockResolvedValue([createChunk(1)]);
    const activeSession: ActiveSession = {
      ...session,
      completedParts: [{ ETag: 'etag-1', PartNumber: 1 }],
    };

    await expect(processUploadQueue(activeSession)).resolves.toEqual(
      activeSession
    );

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(mockedSaveSession).not.toHaveBeenCalled();
    expect(mockedDeleteChunk).toHaveBeenCalledWith('upload-1', 1);
  });

  it('should leave pending chunks untouched while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    mockedGetPendingChunks.mockResolvedValue([createChunk(1)]);

    const result = await processUploadQueue({ ...session, completedParts: [] });

    expect(result.completedParts).toEqual([]);
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(mockedSaveSession).not.toHaveBeenCalled();
    expect(mockedDeleteChunk).not.toHaveBeenCalled();
  });

  it('should retain the failed chunk and stop processing later chunks', async () => {
    vi.useFakeTimers();
    mockedGetPendingChunks.mockResolvedValue([createChunk(1), createChunk(2)]);
    mockedFetch.mockRejectedValue(new Error('network unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const processing = processUploadQueue({ ...session, completedParts: [] });
    await vi.runAllTimersAsync();
    const result = await processing;

    expect(result.completedParts).toEqual([]);
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(mockedSaveSession).not.toHaveBeenCalled();
    expect(mockedDeleteChunk).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Part 1 failed. Retaining in IndexedDB queue.'
    );
  });

  it('should process the queue inside a session-specific Web Lock', async () => {
    const request = vi.fn(
      async (_name: string, callback: (lock: object) => Promise<void>) =>
        callback({})
    );
    vi.stubGlobal('navigator', { onLine: true, locks: { request } });

    await processUploadQueue({ ...session, completedParts: [] });

    expect(request).toHaveBeenCalledWith(
      's3_lock_upload-1',
      expect.any(Function)
    );
    expect(mockedGetPendingChunks).toHaveBeenCalledWith('upload-1');
  });

  it('should leave the session unchanged when the Web Lock is unavailable', async () => {
    const request = vi.fn(
      async (_name: string, callback: (lock: null) => Promise<void>) =>
        callback(null)
    );
    vi.stubGlobal('navigator', { onLine: true, locks: { request } });
    const activeSession: ActiveSession = { ...session, completedParts: [] };

    await expect(processUploadQueue(activeSession)).resolves.toEqual(
      activeSession
    );

    expect(mockedGetPendingChunks).not.toHaveBeenCalled();
  });
});
