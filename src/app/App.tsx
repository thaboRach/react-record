import { Pause, Play, Square } from 'lucide-react';
import Card from '../components/Card';
import IconButton from '../components/IconButton';
import { useAudioRecorder } from '../hooks/useAudioRecoder';
import { formatTime } from '../utils';
import LinkButton from '../components/LinkButton';

function App() {
  const {
    startRecording,
    stopRecording,
    elapsedSeconds,
    recordingStatus,
    pauseRecording,
    resumeRecording,
    downloadAudio,
  } = useAudioRecorder();

  const handleStartPauseClick = () => {
    switch (recordingStatus) {
      case 'idle':
      case 'stopped':
        startRecording();
        break;
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

  return (
    <main className="font-roboto flex min-h-screen flex-col items-center gap-8 p-8 md:p-24 bg-indigo-100 text-slate-600 w-full">
      <h1 className="text-3xl font-bold text-center">Audio Recording</h1>

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
                {formatTime(elapsedSeconds)}
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

          <IconButton onClick={stopRecording}>
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
