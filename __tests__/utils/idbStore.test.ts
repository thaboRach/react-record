import { beforeEach, describe, expect, it, vi } from 'vitest';
import { del, entries, get, set } from 'idb-keyval';
import { IDB } from '../../src/utils/idbStore';
import type { ActiveSession, StoredChunk } from '../../src/types';

vi.mock('idb-keyval', () => ({
  del: vi.fn(),
  entries: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

const mockedDel = vi.mocked(del);
const mockedEntries = vi.mocked(entries);
const mockedGet = vi.mocked(get);
const mockedSet = vi.mocked(set);

const session: ActiveSession = {
  uploadId: 'upload-1',
  s3Key: 'recordings/audio.webm',
  completedParts: [{ ETag: 'etag-1', PartNumber: 1 }],
};

describe('IDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEntries.mockResolvedValue([]);
  });

  describe('session persistence', () => {
    it('should save a session under its upload ID', async () => {
      await IDB.saveSession(session);

      expect(mockedSet).toHaveBeenCalledWith('session_upload-1', session);
    });

    it('should return the session stored for an upload ID', async () => {
      mockedGet.mockResolvedValue(session);

      await expect(IDB.getSession('upload-1')).resolves.toEqual(session);
      expect(mockedGet).toHaveBeenCalledWith('session_upload-1');
    });

    it('should return undefined when an upload session does not exist', async () => {
      mockedGet.mockResolvedValue(undefined);

      await expect(IDB.getSession('missing-upload')).resolves.toBeUndefined();
    });
  });

  describe('chunk persistence', () => {
    it('should save a chunk with its upload ID and part number', async () => {
      const blob = new Blob(['audio']);

      await IDB.saveChunk('upload-1', 2, blob);

      expect(mockedSet).toHaveBeenCalledWith('chunk_upload-1_part_2', {
        uploadId: 'upload-1',
        partNumber: 2,
        blob,
      });
    });

    it('should delete the requested chunk', async () => {
      await IDB.deleteChunk('upload-1', 2);

      expect(mockedDel).toHaveBeenCalledWith('chunk_upload-1_part_2');
    });

    it('should return matching chunks sorted by part number', async () => {
      const partOne: StoredChunk = {
        uploadId: 'upload-1',
        partNumber: 1,
        blob: new Blob(['one']),
      };
      const partTwo: StoredChunk = {
        uploadId: 'upload-1',
        partNumber: 2,
        blob: new Blob(['two']),
      };
      const otherUpload: StoredChunk = {
        uploadId: 'upload-2',
        partNumber: 1,
        blob: new Blob(['other']),
      };
      mockedEntries.mockResolvedValue([
        ['chunk_upload-1_part_2', partTwo],
        ['session_upload-1', session],
        ['chunk_upload-2_part_1', otherUpload],
        ['chunk_upload-1_part_1', partOne],
      ]);

      await expect(IDB.getPendingChunks('upload-1')).resolves.toEqual([
        partOne,
        partTwo,
      ]);
    });
  });

  it('should return only sessions without associated chunks', async () => {
    const orphanedSession: ActiveSession = {
      uploadId: 'upload-2',
      s3Key: 'recordings/orphaned.webm',
      completedParts: [],
    };
    const storedChunk: StoredChunk = {
      uploadId: 'upload-1',
      partNumber: 2,
      blob: new Blob(['audio']),
    };
    mockedEntries.mockResolvedValue([
      ['session_upload-1', session],
      ['chunk_upload-1_part_2', storedChunk],
      ['session_upload-2', orphanedSession],
    ]);

    await expect(IDB.getOrphanedSessions()).resolves.toEqual([orphanedSession]);
  });

  it('should clear only records belonging to the requested upload', async () => {
    mockedEntries.mockResolvedValue([
      ['session_upload-1', session],
      ['chunk_upload-1_part_1', {}],
      ['session_upload-10', {}],
      ['chunk_upload-2_part_1', {}],
    ]);

    await IDB.clearSession('upload-1');

    expect(mockedDel).toHaveBeenCalledTimes(2);
    expect(mockedDel).toHaveBeenCalledWith('session_upload-1');
    expect(mockedDel).toHaveBeenCalledWith('chunk_upload-1_part_1');
  });
});
