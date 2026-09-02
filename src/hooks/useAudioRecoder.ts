import { useState, useRef, useEffect } from 'react';
import { set, del, get } from 'idb-keyval';
import type { RecordingStatus } from '../types/recordingStatus';

type UseAudioRecorderOptions = {
  on5MBPartReady?: (partBlob: Blob, partNumber: number) => Promise<void>;
  onStreamChunk?: (chunk: Blob) => void; // Live WebSocket streaming
};

const S3_MIN_PART_SIZE = 5 * 1024 * 1024; // 5 MB

export function useAudioRecorder({
  on5MBPartReady,
  onStreamChunk,
}: UseAudioRecorderOptions) {
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [seconds, setSeconds] = useState<number>(0);
  const [mimeType, setMimeType] = useState<string>('audio/webm;codecs=opus');

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const currentSizeRef = useRef<number>(0);
  const partNumberRef = useRef<number>(1);

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
  };

  // Clean up timer and streams when component unmounts
  useEffect(() => {
    return () => {
      stopTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      currentSizeRef.current = 0;
      partNumberRef.current = 1;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      setMimeType(
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/mp4'
      );

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size <= 0) return;

        // 1. Live Streaming Callback support for websockets
        onStreamChunk?.(e.data);

        // 2. S3 Buffer logic
        chunksRef.current.push(e.data);
        currentSizeRef.current += e.data.size;

        // 3. Trigger S3 upload when buffer exceeds 5MB
        if (currentSizeRef.current >= S3_MIN_PART_SIZE) {
          const partBlob = new Blob(chunksRef.current, { type: mimeType });
          const partNum = partNumberRef.current;

          // Reset buffers before firing async trigger
          chunksRef.current = [];
          currentSizeRef.current = 0;
          partNumberRef.current += 1;

          await on5MBPartReady?.(partBlob, partNum);
        }
      };

      recorder.onstart = () => {
        console.info('Recording started...');
        setRecordingStatus('recording');
        setSeconds(0);
        startTimer(); // Start timer when recording starts
      };

      recorder.onpause = () => {
        console.info('Recording paused...');
        setRecordingStatus('paused');
        stopTimer(); // Strictly halts the timer loop instantly
      };

      recorder.onresume = () => {
        console.info('Recording resumed...');
        setRecordingStatus('recording');
        startTimer(); // Safely resumes the loop
      };

      recorder.onstop = async () => {
        setRecordingStatus('stopped');

        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          setAudioBlob(blob);

          await on5MBPartReady?.(blob, partNumberRef.current);

          // Instantly save to IndexedDB for offline resilience
          await set('pending_audio_recording', blob); // TODO: might need to remove
        }

        // Stop microphone hardware stream to free resources
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(1000); // Collect data in 1s chunks

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
      console.info('Recording stopped, audio saved to IndexedDB.');
    }
  };

  const clearOfflineBackup = async () => {
    await del('pending_audio_recording');
  };

  const downloadAudio = () => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `recording.${mimeType.split('/')[1].split(';')[0]}`; // Default filename
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      console.warn('No audio available to download.');
      const offlineBlob = get<Blob>('pending_audio_recording');
      if (offlineBlob) {
        offlineBlob.then((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `offline_recording.${mimeType.split('/')[1].split(';')[0]}`; // Default filename
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
          } else {
            console.warn('No offline audio available to download.');
          }
        });
      } else {
        console.warn('No offline audio available to download.');
      }
    }
  };

  return {
    recordingStatus,
    audioBlob,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearOfflineBackup,
    elapsedSeconds: seconds,
    downloadAudio,
  };
}
