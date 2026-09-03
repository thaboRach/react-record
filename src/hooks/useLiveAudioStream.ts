import { useRef, useCallback, useEffect } from 'react';

type PendingChunk = {
  sequence: number;
  blob: Blob;
  attempts: number;
  firstQueuedAt: number;
};

type LiveAudioOptions = {
  enabled: boolean;
  sessionId: string | null;
  mimeType: string;
  url: string;
  maxQueueMs?: number;
  maxAttempts?: number;
  ackTimeoutMs?: number;
};

const DEFAULTS = { maxQueueMs: 30_000, maxAttempts: 3, ackTimeoutMs: 5000 };

export function useLiveAudioStream({
  enabled,
  sessionId,
  mimeType,
  url,
  maxQueueMs = DEFAULTS.maxQueueMs,
  maxAttempts = DEFAULTS.maxAttempts,
  ackTimeoutMs = DEFAULTS.ackTimeoutMs,
}: LiveAudioOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<number, PendingChunk>>(new Map());
  const nextSequenceRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const ackTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const shouldRunRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  /**
   * Clears the acknowledgment timer for a given sequence number.
   * This is used to prevent unnecessary retries once an acknowledgment is received.
   *
   * @param {number} sequence - The sequence number of the chunk whose acknowledgment timer should be cleared.
   */
  const clearAckTimer = (sequence: number) => {
    const timer = ackTimersRef.current.get(sequence);
    if (timer) {
      clearTimeout(timer);
      ackTimersRef.current.delete(sequence);
    }
  };

  /**
   * Prunes the pending queue by removing chunks that have been queued for longer than the maximum allowed queue time.
   * This helps to prevent memory bloat and ensures that stale chunks are not retried indefinitely.
   */
  const pruneQueue = () => {
    const cutoff = Date.now() - maxQueueMs;
    for (const [sequence, chunk] of pendingRef.current) {
      if (chunk.firstQueuedAt < cutoff) {
        pendingRef.current.delete(sequence);
        clearAckTimer(sequence);
      }
    }
  };

  /**
   * Sends a pending audio chunk over the WebSocket connection.
   * Sets up an acknowledgment timer to handle retries if the chunk is not acknowledged in time.
   *
   * @param {number} sequence - The sequence number of the chunk to be sent.
   * @param {PendingChunk} chunk - The audio chunk to be sent.
   */
  const send = (sequence: number, chunk: PendingChunk) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;

    // Backpressure guard: skip sending, keep chunk queued for later
    if (socket.bufferedAmount > 1_000_000) return;

    socket.send(
      JSON.stringify({ type: 'audio', sequence, byteLength: chunk.blob.size })
    );
    socket.send(chunk.blob);

    clearAckTimer(sequence);
    ackTimersRef.current.set(
      sequence,
      setTimeout(() => resend(sequence), ackTimeoutMs)
    );
  };

  /**
   * Resend a pending audio chunk if it has not been acknowledged and has remaining retry attempts.
   * If the maximum number of attempts is exceeded, the chunk is considered lost and removed from the queue.
   *
   * @param {number} sequence - The sequence number of the chunk to be resent.
   */
  const resend = (sequence: number) => {
    const chunk = pendingRef.current.get(sequence);
    if (!chunk) return;

    chunk.attempts += 1;
    if (chunk.attempts > maxAttempts) {
      pendingRef.current.delete(sequence);
      clearAckTimer(sequence);
      console.warn('Live audio chunk lost after retries', sequence);
      return;
    }
    send(sequence, chunk);
  };

  /**
   * Flushes the pending audio queue in order of sequence numbers.
   * Prunes old chunks before sending.
   */
  const flushQueueInOrder = () => {
    pruneQueue();
    const ordered = [...pendingRef.current.entries()].sort(([a], [b]) => a - b);
    for (const [sequence, chunk] of ordered) send(sequence, chunk);
  };

  /**
   * Establishes a WebSocket connection for live audio streaming.
   * Handles reconnection logic and message acknowledgments.
   */
  const connect = useCallback(() => {
    if (!sessionId) return;

    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      reconnectAttemptRef.current = 0;
      socket.send(JSON.stringify({ type: 'start', sessionId, mimeType }));
      flushQueueInOrder(); // replay anything queued while disconnected
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const msg = JSON.parse(event.data);
      if (msg.type === 'ack') {
        pendingRef.current.delete(msg.sequence);
        clearAckTimer(msg.sequence);
      }
    });

    socket.addEventListener('close', () => {
      socketRef.current = null;
      if (!shouldRunRef.current) return;

      const attempt = reconnectAttemptRef.current++;
      const delay =
        Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 1000;
      reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
    });

    socket.addEventListener('error', () => socket.close());
  }, [sessionId, mimeType, url]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    shouldRunRef.current = enabled && !!sessionId;
    if (shouldRunRef.current) connect();

    return () => {
      shouldRunRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      for (const timer of ackTimersRef.current.values()) {
        clearTimeout(timer);
      }
      socketRef.current?.close(1000, 'Recording ended');
      socketRef.current = null;
      pendingRef.current.clear();
    };
  }, [enabled, sessionId, connect]);

  /**
   * Sends a new audio chunk to the live audio stream.
   * The chunk is added to the pending queue and sent immediately.
   *
   * @param {Blob} blob - The audio chunk to be sent.
   */
  const sendChunk = useCallback((blob: Blob) => {
    if (!shouldRunRef.current) return;

    pruneQueue();
    const sequence = nextSequenceRef.current++;
    const chunk: PendingChunk = {
      sequence,
      blob,
      attempts: 0,
      firstQueuedAt: Date.now(),
    };
    pendingRef.current.set(sequence, chunk);
    send(sequence, chunk);
  }, []);

  return { sendChunk };
}
