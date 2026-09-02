import { delay, http, HttpResponse } from 'msw';

// In-memory state to simulate S3 bucket behavior
const activeUploads = new Map<
  string,
  { key: string; parts: Map<number, string> }
>();

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

export const handlers = [
  // POST - /api/s3/create-multipart
  http.post('/api/s3/create-multipart', () => {
    const uploadId = `mock-upload-${Date.now()}`;
    const key = `recordings/audio-${Date.now()}.webm`;

    activeUploads.set(uploadId, { key, parts: new Map() });

    return HttpResponse.json({ uploadId, key });
  }),

  // POST - /api/s3/presign-part
  http.post('/api/s3/presign-part', async ({ request }) => {
    await delay(100); // Simulate network latency
    const { uploadId, key, partNumber } = (await request.json()) as {
      uploadId: string;
      key: string;
      partNumber: number;
    };

    const presignedUrl = `https://mock-bucket.s3.amazonaws.com/${key}?uploadId=${uploadId}&partNumber=${partNumber}`;

    return HttpResponse.json({ presignedUrl });
  }),

  // Intercept the browser's Preflight OPTIONS request
  http.options('https://mock-bucket.s3.amazonaws.com/recordings/*', () => {
    return new HttpResponse(null, {
      status: 200,
      headers: corsHeaders,
    });
  }),

  // PUT - Direct to S3 mock upload
  http.put(
    'https://mock-bucket.s3.amazonaws.com/recordings/:key',
    async ({ request }) => {
      await delay(100); // Simulate network latency

      const url = new URL(request.url);
      const uploadId = url.searchParams.get('uploadId');
      const partNumber = parseInt(
        url.searchParams.get('partNumber') || '1',
        10
      );

      // Force Part 2 to fail once to test retry/IndexedDB mechanics
      // if (partNumber === 2 && Math.random() < 0.5) {
      //   return HttpResponse.error(); // Simulates a network drop / offline state
      // }

      // Read the binary 5MB blob payload
      const audioBlob = await request.blob();

      // Generate a deterministic fake ETag for this chunk
      const fakeETag = `"etag-part-${partNumber}-${audioBlob.size}"`;

      if (uploadId && activeUploads.has(uploadId)) {
        activeUploads.get(uploadId)!.parts.set(partNumber, fakeETag);
      }

      return new HttpResponse(null, {
        status: 200,
        headers: {
          ETag: fakeETag,
          'Access-Control-Expose-Headers': 'ETag',
          ...corsHeaders,
        },
      });
    }
  ),

  // POST - /api/s3/complete-multipart
  http.post('/api/s3/complete-multipart', async ({ request }) => {
    await delay(100); // Simulate network latency

    const { uploadId, parts } = (await request.json()) as {
      uploadId: string;
      key: string;
      parts: { ETag: string; PartNumber: number }[];
    };

    const session = activeUploads.get(uploadId);
    if (!session) {
      return new HttpResponse('Upload session not found', { status: 404 });
    }

    activeUploads.delete(uploadId);

    return HttpResponse.json({
      status: 'SUCCESS',
      location: `https://mock-bucket.s3.amazonaws.com/${session.key}`,
      totalPartsUploaded: parts.length,
    });
  }),
];
