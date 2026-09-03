/**
 * Formats a given time in seconds into a string representation of minutes and seconds (MM:SS).
 * @param totalSeconds - The total time in seconds to be formatted.
 * @returns - A string representing the formatted time in MM:SS format.
 */
export const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
};

/**
 * Formats a given number of bytes into a human-readable string representation (B, KB, MB).
 * @param bytes - The number of bytes to be formatted.
 * @returns - A string representing the formatted size.
 */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
