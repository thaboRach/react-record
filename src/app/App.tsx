import { Pause, Play, Square } from 'lucide-react';
import Card from '../components/Card';
import IconButton from '../components/IconButton';
import { useAudioRecorder } from '../hooks/useAudioRecoder';
import { useState } from 'react';
import { formatTime, formatBytes } from '../utils/helpers';
import LinkButton from '../components/LinkButton';
import { useS3AudioUpload } from '../hooks/useS3AudioUpload';
import { toast } from 'react-hot-toast';
import ButtonSwitch from '../components/ButtonSwitch';
import { useLiveAudioStream } from '../hooks/useLiveAudioStream';

function App() {
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { startSession, completeSession, handle5MBPartReady } =
    useS3AudioUpload();

  const { sendChunk } = useLiveAudioStream({
    enabled: streamingEnabled,
    sessionId,
    mimeType: 'audio/webm;codecs=opus',
    url: 'wss://your-websocket-url', // Replace with your actual WebSocket URL
  });

  const {
    startRecording,
    stopRecording,
    elapsedSeconds,
    recordingStatus,
    pauseRecording,
    resumeRecording,
    downloadAudio,
    recordingSizeBytes,
  } = useAudioRecorder({
    on5MBPartReady: handle5MBPartReady,
    onStreamChunk: sendChunk,
  });

  const handleStartPauseClick = async () => {
    switch (recordingStatus) {
      case 'idle':
      case 'stopped': {
        const newSessionId = crypto.randomUUID();
        setSessionId(newSessionId);
        await startSession(); // Start a new S3 upload session
        await startRecording();
        break;
      }
      case 'recording':
        pauseRecording();
        break;
      case 'paused':
        resumeRecording();
        break;
      default:
        console.warn('Unknown recording status:', recordingStatus);
    }
  };

  const handleStopRecording = async () => {
    stopRecording();

    try {
      await completeSession();
      toast.success('Audio uploaded to S3 successfully!.');
    } catch (err) {
      console.error('Upload complete error:', err);
      toast.error(
        'Recording stopped. Unsent chunks saved to IndexedDB for retry.'
      );
    }
  };

  const handleModeChange = (mode: string) => {
    setStreamingEnabled(mode === 'streaming');
  };

  return (
    <main className="font-roboto flex min-h-screen flex-col items-center gap-8 p-8 md:p-24 bg-indigo-100 text-slate-600 w-full">
      <h1 className="text-3xl font-bold text-center">Audio Recording</h1>

      <ButtonSwitch
        className="md:absolute top-4 right-4"
        onChange={handleModeChange}
      />

      <Card className="flex flex-col items-center gap-4 w-full max-w-150">
        <section
          className={`flex flex-col items-center gap-2 ${recordingStatus === 'idle' || recordingStatus === 'stopped' ? 'mb-8' : 'mb-0'}`}
        >
          {recordingStatus !== 'idle' && recordingStatus !== 'stopped' ? (
            <>
              <p className="text-lg font-medium text-indigo-600">
                {recordingStatus === 'paused'
                  ? 'Recording Paused'
                  : 'Recording in Progress'}
              </p>
              <p className="text-md text-slate-500">
                {formatTime(elapsedSeconds)} · {formatBytes(recordingSizeBytes)}
              </p>
            </>
          ) : (
            <p className="text-lg font-medium text-slate-500">
              Start recording
            </p>
          )}
        </section>

        <section className="flex items-center gap-4">
          <IconButton onClick={handleStartPauseClick}>
            {recordingStatus === 'recording' ? (
              <Pause />
            ) : (
              <Play className="text-green-600 fill-green-600" />
            )}
          </IconButton>

          <IconButton onClick={handleStopRecording}>
            <Square className=" text-red-600 fill-red-600" />
          </IconButton>
        </section>

        <LinkButton
          disabled={recordingStatus !== 'stopped'}
          onClick={downloadAudio}
        >
          Download Audio
        </LinkButton>
      </Card>
    </main>
  );
}

export default App;
