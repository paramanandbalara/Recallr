import type { AudioSource, Settings } from '../services/storage';
import { canTranscribe, transcribeAudio } from '../services/transcribe';
import { useState, useEffect, useRef, useCallback } from 'react';

// System audio = what comes out of the speakers (the other people in the call), not the user's mic.
// Chromium only hands out system audio together with a screen video track. We don't need the
// video, so we stop it right away (on macOS it also floods the log with "Can't wrap SharedImage").
// If stopping it would end the audio too, we keep the video track and just disable it.
const getSystemAudioStream = async () => {
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

const getMicrophoneStream = () => navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
});

type Keys = Pick<Settings, 'groqKey' | 'openaiKey'>;

export const useAudioCapture = (onTranscript: (text: string, isFinal: boolean) => void, keys: Keys, audioSource: AudioSource) => {
  const [isRecording, setIsRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState(0); // 0..1, for the level meter
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // Audio-only stream that gets recorded
  const captureStreamRef = useRef<MediaStream | null>(null); // Original capture (may include the tiny video track)
  const isTranscribingRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  
  // VAD (Voice Activity Detection) states
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const digitalSilenceMsRef = useRef(0); // How long the capture has delivered pure zeros

  // Release any running capture when the page reloads or closes (e.g. a dev hot reload)
  useEffect(() => {
    const release = () => {
      captureStreamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  const transcribe = async (blob: Blob) => {
    try {
      const text = await transcribeAudio(blob, keys);
      
      // Filter Whisper's common silence hallucinations (YouTube dataset)
      const hallucinations = [
        "thanks for watching", "thank you for watching", "subscribe", "like and subscribe",
        "see you next time", "bye", "subtitles", "transcription", "youtube", "channel", "amen"
      ];
      
      // Check whether the WHOLE text is just a common hallucination
      const isHallucination = text.length < 50 && hallucinations.some(h => text.toLowerCase().includes(h));

      if (text && text.length > 2 && !isHallucination) {
        setDebugLog(`Heard: ${text.substring(0, 30)}...`);
        // Send the text as final
        onTranscript(text, true);
      } else {
        setDebugLog(isHallucination ? 'Hallucination blocked.' : 'Audio contained no speech.');
      }

    } catch (err) {
      setDebugLog(err instanceof Error ? err.message : 'Transcription failed.');
      // Don't stop recording on an isolated network error, just log it
    } finally {
      isTranscribingRef.current = false;
    }
  };

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach(track => track.stop());
      captureStreamRef.current = null;
    }
    setDebugLog('Stopped');
    setAudioLevel(0);
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!canTranscribe(keys)) {
      setErrorMsg('Listening needs a Groq or OpenAI key for speech-to-text. Add one in Settings → API keys.');
      return;
    }

    try {
      setErrorMsg(null);
      
      const { capture, videoKept } = audioSource === 'system'
        ? await getSystemAudioStream()
        : { capture: await getMicrophoneStream(), videoKept: false };
      captureStreamRef.current = capture;
      const stream = new MediaStream(capture.getAudioTracks());
      streamRef.current = stream;

      // If the OS or the user ends the capture, stop cleanly instead of recording silence
      capture.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (isRecordingRef.current) {
          setErrorMsg('Audio capture ended.');
          stopRecording();
        }
      });

      setDebugLog(audioSource === 'microphone' ? 'Listening to microphone...'
        : videoKept ? 'Listening to system audio (screen video kept paused)...'
        : 'Listening to system audio...');

      // Setup VAD (Voice Activity Detection) via Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Float32Array(analyser.fftSize);
      digitalSilenceMsRef.current = 0;

      // Call audio arrives at its raw level (no auto gain), so it needs a lower threshold than the mic
      const voiceThreshold = audioSource === 'system' ? 0.004 : 0.012;

      // Record one clean, complete chunk
      const recordChunk = () => {
        if (!streamRef.current || !isRecordingRef.current) return;
        
        const mediaRecorder = new MediaRecorder(streamRef.current, {
          mimeType: 'audio/webm;codecs=opus'
        });
        mediaRecorderRef.current = mediaRecorder;

        const audioChunks: Blob[] = [];
        let hasVoice = false;
        let silenceCount = 0;
        let recordingTime = 0;

        // Check the volume periodically while recording
        const checkVolume = setInterval(() => {
          recordingTime += 100;
          
          if (analyserRef.current && dataArrayRef.current) {
            const samples = dataArrayRef.current;
            analyserRef.current.getFloatTimeDomainData(samples);
            let sumSquares = 0;
            let peak = 0;
            for (let i = 0; i < samples.length; i++) {
              sumSquares += samples[i] * samples[i];
              peak = Math.max(peak, Math.abs(samples[i]));
            }
            const rms = Math.sqrt(sumSquares / samples.length);
            setAudioLevel(Math.min(1, rms * 12));

            // Loudness (RMS) above the threshold counts as speech
            if (rms > voiceThreshold) {
              hasVoice = true;
              silenceCount = 0;
            } else {
              silenceCount += 100;
            }

            // Pure zeros for a while usually means macOS hasn't allowed system audio capture
            if (peak === 0) {
              digitalSilenceMsRef.current += 100;
              if (audioSource === 'system' && digitalSilenceMsRef.current === 6000) {
                setErrorMsg('No sound is reaching the app. If the call/video is playing, allow "Electron" (or Recallr) under System Settings → Privacy & Security → Screen & System Audio Recording → "System Audio Recording Only", then restart the app.');
              }
            } else {
              if (digitalSilenceMsRef.current >= 6000) setErrorMsg(null);
              digitalSilenceMsRef.current = 0;
            }
          }

          // Dynamic endpointing: cut the audio only when the speaker pauses
          // Cut if: was speaking and paused for 800ms, OR reached 8 seconds (hard limit), OR 3s of pure silence (recycle)
          const shouldCut = (hasVoice && silenceCount >= 800 && recordingTime >= 1000) || recordingTime >= 8000 || (!hasVoice && silenceCount >= 3000);
          
          if (shouldCut) {
            clearInterval(checkVolume);
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
            if (isRecordingRef.current) {
              recordChunk();
            }
          }
        }, 100); // Check every 100ms

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          clearInterval(checkVolume);
          
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          if (blob.size > 0 && isRecordingRef.current) {
            if (!hasVoice) {
               setDebugLog('Waiting for speech...');
               return; // Don't send silence to speech-to-text (prevents hallucinations at the source)
            }
            
            if (isTranscribingRef.current) {
              // Ignore if busy
            } else {
              isTranscribingRef.current = true;
              setDebugLog('Transcribing...');
              await transcribe(blob);
            }
          }
        };

        mediaRecorder.start();
      };

      setIsRecording(true);
      isRecordingRef.current = true;
      recordChunk();

    } catch (err) {
      console.error(err);
      captureStreamRef.current?.getTracks().forEach(track => track.stop());
      captureStreamRef.current = null;
      if (audioSource === 'system') {
        setErrorMsg(err instanceof Error && err.message === 'NO_SYSTEM_AUDIO'
          ? 'No system audio available. Try Settings → Audio → Microphone.'
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
