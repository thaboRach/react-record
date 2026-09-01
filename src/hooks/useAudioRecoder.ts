import { useState, useRef, useEffect } from 'react';
import { set, del, get } from 'idb-keyval';
import type { RecordingStatus } from '../types/recordingStatus';

export function useAudioRecorder() {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      setMimeType(
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/mp4'
      );

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
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

        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);

        // Instantly save to IndexedDB for offline resilience
        await set('pending_audio_recording', blob);

        // Stop microphone track hardware lights
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

      // Stop mic hardware stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
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
