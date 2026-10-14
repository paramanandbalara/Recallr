import type { AudioSource, Settings } from '../services/storage';
import { canTranscribe, transcribeAudio } from '../services/transcribe';
import { ECHO_WINDOW_MS, isEcho } from '../services/echo';
import { useState, useEffect, useRef, useCallback } from 'react';

// System audio = what comes out of the speakers (the other people in the call), not the user's mic.
// Chromium only hands out system audio together with a screen video track. We don't need the
// video, so we stop it right away (on macOS it also floods the log with "Can't wrap SharedImage").
// If stopping it would end the audio too, we keep the video track and just disable it.
export const getSystemAudioStream = async () => {
  const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { frameRate: { max: 1 } } });
  const [audioTrack] = display.getAudioTracks();
  if (!audioTrack) {
    display.getTracks().forEach(track => track.stop());
    throw new Error('NO_SYSTEM_AUDIO');
  }

  display.getVideoTracks().forEach(track => track.stop());
  await new Promise(resolve => setTimeout(resolve, 300));
  if (audioTrack.readyState === 'live') return { capture: display, videoKept: false };

  // Audio ended together with the video on this system: capture again and keep the video idle
  const retry = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { frameRate: { max: 1 } } });
  if (retry.getAudioTracks().length === 0) {
    retry.getTracks().forEach(track => track.stop());
    throw new Error('NO_SYSTEM_AUDIO');
  }
  retry.getVideoTracks().forEach(track => { track.enabled = false; });
  return { capture: retry, videoKept: true };
};

export const getMicrophoneStream = () => navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
});

type Keys = Pick<Settings, 'groqKey' | 'openaiKey'> & Partial<Pick<Settings, 'language'>>;

// Who said it: the call audio is the interviewer, the microphone is the user
export type Speaker = 'interviewer' | 'you';

// Filter Whisper's common silence hallucinations (YouTube dataset)
const HALLUCINATIONS = [
  'thanks for watching', 'thank you for watching', 'subscribe', 'like and subscribe',
  'see you next time', 'bye', 'subtitles', 'transcription', 'youtube', 'channel', 'amen',
];
const isHallucination = (text: string) => text.length < 50 && HALLUCINATIONS.some(h => text.toLowerCase().includes(h));

// ---------- One audio stream: detect speech, cut it into chunks, transcribe each chunk ----------

interface Pipeline {
  // With `flush`, the speech still being recorded is transcribed first (the promise waits for it)
  stop: (flush?: boolean) => Promise<void>;
}

interface PipelineOptions {
  stream: MediaStream;
  isSystem: boolean;
  keys: Keys;
  onText: (text: string) => void;
  onLevel: (level: number) => void;
  onLog: (message: string) => void;
  onNoSound: (silent: boolean) => void; // System audio delivered pure zeros for a while (or recovered)
}

const startPipeline = ({ stream, isSystem, keys, onText, onLevel, onLog, onNoSound }: PipelineOptions): Pipeline => {
  let running = true;
  let flushing = false;
  let finishFlush: (() => void) | null = null;
  let queue = Promise.resolve(); // Chunks are transcribed in order, none dropped
  let digitalSilenceMs = 0;
  let recorder: MediaRecorder | null = null;

  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  // Call audio arrives at its raw level (no auto gain), so it needs a lower threshold than the mic
  const voiceThreshold = isSystem ? 0.004 : 0.012;

  const transcribe = async (blob: Blob) => {
    onLog('Transcribing...');
    try {
      const text = await transcribeAudio(blob, keys);
      if (text && text.length > 2 && !isHallucination(text)) {
        onLog(`Heard: ${text.substring(0, 30)}...`);
        if (running || flushing) onText(text);
      } else {
        onLog(isHallucination(text) ? 'Hallucination blocked.' : 'Audio contained no speech.');
      }
    } catch (err) {
      // Don't stop recording on an isolated network error, just log it
      onLog(err instanceof Error ? err.message : 'Transcription failed.');
    }
  };

  // Record one clean, complete chunk
  const recordChunk = () => {
    if (!running) return;
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder = mediaRecorder;
    const audioChunks: Blob[] = [];
    let hasVoice = false;
    let silenceCount = 0;
    let recordingTime = 0;

    // Check the volume periodically while recording
    const checkVolume = setInterval(() => {
      recordingTime += 100;
      analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        sumSquares += samples[i] * samples[i];
        peak = Math.max(peak, Math.abs(samples[i]));
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      onLevel(Math.min(1, rms * 12));

      // Loudness (RMS) above the threshold counts as speech
      if (rms > voiceThreshold) {
        hasVoice = true;
        silenceCount = 0;
      } else {
        silenceCount += 100;
      }

      // Pure zeros for a while usually means macOS hasn't allowed system audio capture
      if (peak === 0) {
        digitalSilenceMs += 100;
        if (isSystem && digitalSilenceMs === 6000) onNoSound(true);
      } else {
        if (digitalSilenceMs >= 6000) onNoSound(false);
        digitalSilenceMs = 0;
      }

      // Dynamic endpointing: cut the audio only when the speaker pauses
      // Cut if: was speaking and paused for 800ms, OR reached 8 seconds (hard limit), OR 3s of pure silence (recycle)
      const shouldCut = (hasVoice && silenceCount >= 800 && recordingTime >= 1000) || recordingTime >= 8000 || (!hasVoice && silenceCount >= 3000);
      if (shouldCut) {
        clearInterval(checkVolume);
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        recordChunk();
      }
    }, 100);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      clearInterval(checkVolume);
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      // Don't send silence to speech-to-text (prevents hallucinations at the source)
      if (blob.size > 0 && (running || flushing) && hasVoice) {
        queue = queue.then(() => transcribe(blob));
      } else if (running && !hasVoice) {
        onLog('Waiting for speech...');
      }
      if (finishFlush && recorder === mediaRecorder) queue.then(finishFlush);
    };

    mediaRecorder.start();
  };

  recordChunk();

  return {
    stop: (flush = false) => new Promise<void>(resolve => {
      running = false;
      audioContext.close();
      if (recorder && recorder.state !== 'inactive') {
        if (flush) {
          flushing = true;
          finishFlush = () => {
            flushing = false;
            resolve();
          };
        }
        recorder.stop();
        if (!flush) resolve();
      } else if (flush) {
        queue.then(() => resolve());
      } else {
        resolve();
      }
    }),
  };
};

// ---------- The hook ----------

const SOURCE_LOG: Record<AudioSource, string> = {
  system: 'Listening to system audio...',
  microphone: 'Listening to microphone...',
  both: 'Listening to the call and your microphone...',
};

export const useAudioCapture = (onTranscript: (text: string, speaker: Speaker) => void, keys: Keys, audioSource: AudioSource) => {
  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState(0); // 0..1, for the level meter

  const pipelinesRef = useRef<Pipeline[]>([]);
  const capturesRef = useRef<MediaStream[]>([]); // Original captures (may include the tiny video track)
  const recentCallRef = useRef<{ text: string; at: number }[]>([]); // For spotting echo in the mic
  const isRecordingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; });

  // Release any running capture when the page reloads or closes (e.g. a dev hot reload), or the component unmounts
  useEffect(() => {
    const pipelines = pipelinesRef;
    const captures = capturesRef;
    const release = () => {
      pipelines.current.forEach(pipeline => pipeline.stop());
      pipelines.current = [];
      captures.current.forEach(capture => capture.getTracks().forEach(track => track.stop()));
    };
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  // With `flush`, waits until the last words said before stopping are transcribed and delivered
  const stopRecording = useCallback(async (flush = false) => {
    isRecordingRef.current = false;
    const stopping = pipelinesRef.current.map(pipeline => pipeline.stop(flush));
    pipelinesRef.current = [];
    capturesRef.current.forEach(capture => capture.getTracks().forEach(track => track.stop()));
    capturesRef.current = [];
    recentCallRef.current = [];
    setAudioLevel(0);
    setIsRecording(false);
    await Promise.all(stopping);
    setDebugLog('Stopped');
  }, []);

  const startRecording = useCallback(async () => {
    if (!canTranscribe(keys)) {
      setErrorMsg('Listening needs a Groq or OpenAI key for speech-to-text. Add one in Settings → API keys.');
      return;
    }
    setErrorMsg(null);
    const wantsSystem = audioSource !== 'microphone';
    const wantsMic = audioSource !== 'system';

    let step: 'system' | 'microphone' = 'system';
    try {
      let videoKept = false;
      let systemCapture: MediaStream | null = null;
      if (wantsSystem) {
        const result = await getSystemAudioStream();
        systemCapture = result.capture;
        videoKept = result.videoKept;
        capturesRef.current.push(systemCapture);
      }
      step = 'microphone';
      const micCapture = wantsMic ? await getMicrophoneStream() : null;
      if (micCapture) capturesRef.current.push(micCapture);

      isRecordingRef.current = true;
      setIsRecording(true);
      setDebugLog(videoKept ? `${SOURCE_LOG[audioSource]} (screen video kept paused)` : SOURCE_LOG[audioSource]);

      // The level meter shows whichever source is louder
      const levels = { system: 0, mic: 0 };
      const showLevel = () => setAudioLevel(Math.max(levels.system, levels.mic));
      const prefix = audioSource === 'both' ? { system: 'Call: ', mic: 'You: ' } : { system: '', mic: '' };

      if (systemCapture) {
        const stream = new MediaStream(systemCapture.getAudioTracks());
        pipelinesRef.current.push(startPipeline({
          stream,
          isSystem: true,
          keys,
          onText: text => {
            recentCallRef.current = [...recentCallRef.current.filter(c => Date.now() - c.at < ECHO_WINDOW_MS), { text, at: Date.now() }];
            onTranscriptRef.current(text, 'interviewer');
          },
          onLevel: level => { levels.system = level; showLevel(); },
          onLog: message => setDebugLog(prefix.system + message),
          onNoSound: silent => setErrorMsg(silent
            // macOS sends exact silence both when nothing is playing and when recording isn't allowed
            ? 'No sound from the call yet. If something is playing and this stays, allow Recallr (in development: "Electron") under System Settings → Privacy & Security → Screen & System Audio Recording → "System Audio Recording Only", then restart it.'
            : null),
        }));
      }
      if (micCapture) {
        pipelinesRef.current.push(startPipeline({
          stream: micCapture,
          isSystem: false,
          keys,
          onText: text => {
            // With both sources, the mic also hears the interviewer through the speakers: skip that echo
            if (systemCapture && isEcho(text, recentCallRef.current)) {
              setDebugLog('You: skipped (echo of the call)');
              return;
            }
            onTranscriptRef.current(text, audioSource === 'both' ? 'you' : 'interviewer');
          },
          onLevel: level => { levels.mic = level; showLevel(); },
          onLog: message => setDebugLog(prefix.mic + message),
          onNoSound: () => {},
        }));
      }

      // If the OS or the user ends a capture, stop cleanly instead of recording silence
      capturesRef.current.forEach(capture => capture.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (isRecordingRef.current) {
          setErrorMsg('Audio capture ended.');
          stopRecording();
        }
      }));
    } catch (err) {
      console.error(err);
      capturesRef.current.forEach(capture => capture.getTracks().forEach(track => track.stop()));
      capturesRef.current = [];
      if (step === 'system') {
        setErrorMsg(err instanceof Error && err.message === 'NO_SYSTEM_AUDIO'
          ? 'No system audio available. Switch the audio button to Mic.'
          : 'Could not capture system audio. On macOS, allow it in System Settings → Privacy & Security → Screen & System Audio Recording, then restart the app.');
      } else {
        setErrorMsg('Could not start the microphone. Check microphone permission in System Settings.');
      }
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  }, [keys, audioSource, stopRecording]);

  return { isRecording, startRecording, stopRecording, errorMsg, debugLog, audioLevel };
};
