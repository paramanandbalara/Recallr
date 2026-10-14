import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, XCircle, Loader2, Circle, RotateCcw } from 'lucide-react';
import { findVisionModel, PROVIDERS, streamChat, testKey, type ProviderId } from '../services/llm';
import { loadActiveProfile, loadSettings } from '../services/storage';
import { getMicrophoneStream, getSystemAudioStream } from '../hooks/useAudioCapture';
import { Button, IconButton } from './ui';

interface Props {
  onClose: () => void;
}

type Status = 'idle' | 'running' | 'ok' | 'warn' | 'fail';
type CheckId = 'keys' | 'speed' | 'profile' | 'mic' | 'call' | 'screen';

interface Check {
  status: Status;
  detail: string;
}

const CHECKS: { id: CheckId; label: string }[] = [
  { id: 'keys', label: 'API keys' },
  { id: 'speed', label: 'Answer speed' },
  { id: 'profile', label: 'Profile' },
  { id: 'mic', label: 'Microphone' },
  { id: 'call', label: 'Call audio' },
  { id: 'screen', label: 'Read from screen' },
];

const MIC_TEST_MS = 3000;
const CALL_TEST_MS = 4000;
const SLOW_ANSWER_MS = 2500;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const mediaAccess = async (): Promise<{ microphone: string; screen: string }> =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  (await window.ipcRenderer?.invoke('media-access')) ?? { microphone: 'granted', screen: 'granted' };

// Loudest RMS level over `ms`, and whether the stream delivered anything but pure zeros
const measureLevel = async (stream: MediaStream, ms: number) => {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let loudest = 0;
  let anySignal = false;
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    await sleep(100);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      sum += sample * sample;
      if (sample !== 0) anySignal = true;
    }
    loudest = Math.max(loudest, Math.sqrt(sum / samples.length));
  }
  await context.close();
  return { loudest, anySignal };
};

const ICONS: Record<Status, React.ReactNode> = {
  idle: <Circle className="w-4 h-4 text-slate-600" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  fail: <XCircle className="w-4 h-4 text-red-400" />,
};

const initialChecks = () => Object.fromEntries(CHECKS.map(c => [c.id, { status: 'idle', detail: '' }])) as Record<CheckId, Check>;

// Tests everything an interview needs, one by one, with a fix for anything that's wrong
export const SetupCheck: React.FC<Props> = ({ onClose }) => {
  const [checks, setChecks] = useState(initialChecks);
  const [running, setRunning] = useState(true);
  const runIdRef = useRef(0); // Only the newest run updates the screen; an older one stops at its next step

  const run = useCallback(async () => {
    const runId = ++runIdRef.current;
    const stale = () => runIdRef.current !== runId;
    const set = (id: CheckId, status: Status, detail: string) => {
      if (!stale()) setChecks(prev => ({ ...prev, [id]: { status, detail } }));
    };
    setRunning(true);
    setChecks(initialChecks());
    const settings = loadSettings();
    const access = await mediaAccess();
    if (stale()) return;

    // 1. Keys
    set('keys', 'running', 'Checking your keys...');
    const withKey = (Object.keys(PROVIDERS) as ProviderId[]).filter(p => settings[PROVIDERS[p].keyField].trim().length > 10);
    const problems = (await Promise.all(withKey.map(async p => [p, await testKey(p, settings[PROVIDERS[p].keyField])] as const)))
      .filter(([, error]) => error);
    const working = withKey.length - problems.length;
    if (withKey.length === 0) set('keys', 'fail', 'No API key. Add a Groq or OpenAI key in Settings → API keys.');
    else if (working === 0) set('keys', 'fail', problems.map(([, error]) => error).join(' '));
    else if (problems.length) set('keys', 'warn', `${working} of ${withKey.length} keys work. ${problems.map(([, error]) => error).join(' ')}`);
    else set('keys', 'ok', `${withKey.map(p => PROVIDERS[p].label).join(' and ')} ${withKey.length > 1 ? 'keys work' : 'key works'}.`);

    if (stale()) return;

    // 2. How fast answers start
    if (working > 0) {
      set('speed', 'running', 'Asking a test question...');
      try {
        const startedAt = performance.now();
        let firstMs = 0;
        let provider: ProviderId | undefined;
        await streamChat(settings, {
          tier: 'fast',
          system: 'Reply with one short word.',
          user: 'Say ready.',
          maxTokens: 300,
          onFirstText: p => { firstMs = performance.now() - startedAt; provider = p; },
        }, () => {});
        const seconds = `${(firstMs / 1000).toFixed(1)} s`;
        const by = provider ? ` (${PROVIDERS[provider].label})` : '';
        set('speed', firstMs < SLOW_ANSWER_MS ? 'ok' : 'warn', firstMs < SLOW_ANSWER_MS
          ? `Answers start in about ${seconds}${by}.`
          : `Answers take ${seconds} to start${by}. Groq is usually fastest: add a Groq key or pick it in Settings → API keys.`);
      } catch (error) {
        set('speed', 'fail', error instanceof Error ? error.message : 'The test question failed.');
      }
    } else {
      set('speed', 'fail', 'Needs a working API key.');
    }

    if (stale()) return;

    // 3. Profile
    const profile = loadActiveProfile();
    const missing = [!profile.cv.trim() && 'resume', !profile.job.trim() && 'job description'].filter(Boolean);
    const answered = profile.answers.filter(a => a.answer.trim()).length;
    set('profile', missing.length ? 'warn' : 'ok', missing.length
      ? `"${profile.name}" has no ${missing.join(' or ')}. Answers will be generic: add ${missing.length > 1 ? 'them' : 'it'} in Settings → Profile.`
      : `"${profile.name}": resume and job description set, ${answered} prepared ${answered === 1 ? 'answer' : 'answers'}.`);

    // 4. Microphone
    if (access.microphone === 'denied' || access.microphone === 'restricted') {
      set('mic', 'fail', 'Microphone access is off. Turn it on in System Settings → Privacy & Security → Microphone, then restart Recallr.');
    } else {
      set('mic', 'running', 'Say a few words now...');
      try {
        const stream = await getMicrophoneStream();
        const { loudest } = await measureLevel(stream, MIC_TEST_MS);
        stream.getTracks().forEach(track => track.stop());
        set('mic', loudest > 0.02 ? 'ok' : 'warn', loudest > 0.02
          ? 'Your microphone is working.'
          : "Didn't hear you. Check the input device in your system sound settings (only needed for Mic and Call + mic).");
      } catch {
        set('mic', 'fail', 'Could not open the microphone. Check its permission in System Settings → Privacy & Security → Microphone.');
      }
    }

    if (stale()) return;

    // 5. Call audio
    set('call', 'running', 'Play any sound now (a video, music...)');
    try {
      const { capture } = await getSystemAudioStream();
      const { loudest, anySignal } = await measureLevel(new MediaStream(capture.getAudioTracks()), CALL_TEST_MS);
      capture.getTracks().forEach(track => track.stop());
      if (!anySignal) {
        set('call', 'fail', 'No sound reaches Recallr. On macOS, allow it in System Settings → Privacy & Security → Screen & System Audio Recording → "System Audio Recording Only", then restart Recallr.');
      } else {
        set('call', loudest > 0.002 ? 'ok' : 'warn', loudest > 0.002
          ? 'Call audio is reaching Recallr.'
          : 'Connected, but nothing was playing. Play something and run the check again to be sure.');
      }
    } catch {
      set('call', 'fail', 'Could not capture the computer\'s audio. On macOS, allow it in System Settings → Privacy & Security → Screen & System Audio Recording, then restart Recallr.');
    }

    if (stale()) return;

    // 6. Reading the screen
    set('screen', 'running', 'Checking...');
    const vision = working > 0 ? await findVisionModel(settings) : null;
    if (access.screen === 'denied' || access.screen === 'restricted') {
      set('screen', 'warn', 'Screen Recording is off, so "Read from screen" can\'t see other apps. Turn it on in System Settings → Privacy & Security → Screen Recording.');
    } else if (!vision) {
      set('screen', 'warn', 'None of your keys has a model that can read images. "Read from screen" needs a Groq or OpenAI key with one.');
    } else {
      set('screen', 'ok', `Ready (${PROVIDERS[vision.provider].label}).`);
    }

    if (!stale()) setRunning(false);
  }, []);

  // Start once the panel is shown (in development React mounts twice: the first start is cancelled)
  useEffect(() => {
    const timer = setTimeout(run);
    const runs = runIdRef;
    return () => {
      clearTimeout(timer);
      runs.current++;
    };
  }, [run]);

  const done = !running && CHECKS.every(c => checks[c.id].status !== 'idle');
  const failed = CHECKS.filter(c => checks[c.id].status === 'fail').length;
  const warned = CHECKS.filter(c => checks[c.id].status === 'warn').length;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-slate-900">
      <div className="drag-area flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <h2 className="text-sm font-semibold text-slate-100">Pre-interview check</h2>
        <IconButton onClick={onClose} title="Close"><X className="w-4 h-4" /></IconButton>
      </div>

      <ul className="scrollable flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {CHECKS.map(({ id, label }) => (
          <li key={id} className="flex gap-2.5 rounded-lg border border-slate-800 px-3 py-2.5">
            <span className="mt-px shrink-0">{ICONS[checks[id].status]}</span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-200">{label}</div>
              {checks[id].detail && (
                <div className={`mt-0.5 text-[11px] leading-relaxed ${checks[id].status === 'running' ? 'text-blue-300' : 'text-slate-400'}`}>
                  {checks[id].detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
        <span className="text-[11px] text-slate-400">
          {!done ? 'Checking...' : failed ? `${failed} to fix before the interview.` : warned ? 'Ready, with a few things to look at.' : "All set. You're ready."}
        </span>
        <Button size="sm" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={run} disabled={running}>Run again</Button>
      </div>
    </div>
  );
};
