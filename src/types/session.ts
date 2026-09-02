export type ActiveSession = {
  uploadId: string;
  s3Key: string;
  completedParts: Array<{ ETag: string; PartNumber: number }>;
};
