import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Settings, X, Minus, MessageSquareQuote, SendHorizontal, Pin, PinOff, SquarePen, Volume2, SlidersHorizontal, History, ScanText, Users } from 'lucide-react';
import { useAudioCapture, type Speaker } from './hooks/useAudioCapture';
import { useClickThrough, useTypingFocus } from './hooks/useClickThrough';
import { answerExtras, readQuestionFromScreen, streamInterviewAnswer, type AdjustMode } from './services/ai';
import { describeAiError } from './services/llm';
import { matchPreparedAnswer } from './services/matchAnswer';
import { isLikelyQuestion } from './services/questionDetect';
import { hasAnyKey, loadActiveProfile, loadAudioSource, loadConversation, loadCurrentSession, loadDisplay, loadOverlay, loadSettings, newId, newSession, saveAudioSource, saveConversation, saveCurrentSession, saveDisplay, saveOverlay, type AudioSource, type PreparedAnswer } from './services/storage';
import { hasAnswers, loadSession, saveSession, sessionTitle } from './services/sessions';
import { ConversationFeed, type Turn } from './components/ConversationFeed';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingScreen } from './components/OnboardingScreen';
import { DisplayMenu } from './components/DisplayMenu';
import { HistoryPanel } from './components/HistoryPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { SetupCheck } from './components/SetupCheck';
import { MockInterview } from './components/MockInterview';
import { IconButton } from './components/ui';

const PAUSE_BEFORE_ANSWER_MS = 500;
const FILLER_TIMEOUT_MS = 5000;
const SAVE_DELAY_MS = 600;

const SETUP_SIZE = { width: 440, height: 700 };
const COMPACT_SIZE = { width: 380, height: 520 };

const sendIpc = (channel: string, ...args: unknown[]) => {
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.send(channel, ...args);
};

const onShortcut = (listener: (action: string) => void): (() => void) | undefined =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.onShortcut?.(listener);

const captureScreens = (): Promise<{ images?: string[]; error?: 'permission' | 'empty' } | undefined> =>
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.invoke('capture-screens');

const SCREEN_ERRORS = {
  permission: 'Recallr needs Screen Recording permission to read your screen. Turn it on in System Settings → Privacy & Security → Screen Recording, then restart Recallr.',
  empty: "Couldn't capture the screen.",
};

const AUDIO_SOURCES: Record<AudioSource, { next: AudioSource; label: string; title: string }> = {
  system: { next: 'both', label: 'Call audio', title: 'Hearing the call audio: only the other people in the call (click to also hear your microphone)' },
  both: { next: 'microphone', label: 'Call + mic', title: 'Hearing the call and your microphone separately, so Recallr knows what you actually said (click for microphone only)' },
  microphone: { next: 'system', label: 'Mic', title: 'Hearing your microphone only (click for the call audio)' },
};

interface InFlight {
  controller: AbortController;
  restore: Partial<Turn>;
}

const closeUnfinished = (turns: Turn[]): Turn[] => turns.map(turn =>
  ['listening', 'thinking', 'answering'].includes(turn.status)
    ? { ...turn, status: turn.answer ? 'done' : 'skipped' }
    : turn);

function App() {
  // ⬇️ ADDED: click-through + typing focus management
  useClickThrough();
  useTypingFocus();

  const [settings, setSettings] = useState(() => loadSettings());
  const [setProfileName] = useState(() => loadActiveProfile().name);
  const reloadSettings = () => {
    setSettings(loadSettings());
    setProfileName(loadActiveProfile().name);
  };
  const [hasApiKey, setHasApiKey] = useState(() => hasAnyKey(settings));

  const [turns, setTurns] = useState<Turn[]>(() => closeUnfinished(loadConversation<Turn>()));
  const [session, setSession] = useState(loadCurrentSession);
  const sessionRef = useRef(session);
  const turnsRef = useRef(turns);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [askText, setAskText] = useState('');
  const [overlay, setOverlay] = useState(() => loadOverlay());
  const [audioSource, setAudioSource] = useState<AudioSource>(() => loadAudioSource());
  const [display, setDisplay] = useState(() => loadDisplay());
  const [isDisplayOpen, setIsDisplayOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [isCheckOpen, setIsCheckOpen] = useState(false);
  const [isMockOpen, setIsMockOpen] = useState(false);
  const askInputRef = useRef<HTMLInputElement>(null);
  const closeDisplay = useCallback(() => setIsDisplayOpen(false), []);

  const openTurnRef = useRef<{ id: string; question: string } | null>(null);
  const lastSpeechAtRef = useRef(0);
  const inFlightRef = useRef(new Map<string, InFlight>());
  const lastPreparedIdRef = useRef<string | null>(null);

  // Save the conversation to the history, once it has an answer (and not just because it was reopened)
  const openedTurnsRef = useRef<Turn[] | null>(null);
  const persistSession = useCallback((list: Turn[]) => {
    if (!hasAnswers(list) || list === openedTurnsRef.current) return;
    const profile = loadActiveProfile();
    saveSession({
      ...sessionRef.current,
      title: sessionTitle(list),
      profileId: profile.id,
      profileName: profile.name,
      updatedAt: Date.now(),
      turns: list,
    })?.catch(error => console.error('Could not save to history:', error));
  }, []);

  useEffect(() => {
    turnsRef.current = turns;
    const timer = setTimeout(() => {
      saveConversation(turns);
      persistSession(turns);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [turns, persistSession]);

  useEffect(() => {
    const flush = () => {
      saveConversation(turnsRef.current);
      persistSession(turnsRef.current);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [persistSession]);

  useEffect(() => {
    sendIpc('set-overlay', loadOverlay());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = display.theme;
    root.style.setProperty('--answer-size', `${display.textSize}px`);
    root.style.setProperty('--bg-opacity', String(display.bgOpacity));
    root.style.setProperty('--text-opacity', String(display.textOpacity));
    saveDisplay(display);
  }, [display]);

  useEffect(() => {
    const size = hasApiKey ? COMPACT_SIZE : SETUP_SIZE;
    sendIpc('set-window-size', size.width, size.height);
  }, [hasApiKey]);

  const toggleAudioSource = () => {
    const next = AUDIO_SOURCES[audioSource].next;
    setAudioSource(next);
    saveAudioSource(next);
  };

  const toggleOverlay = () => {
    const next = !overlay;
    setOverlay(next);
    saveOverlay(next);
    sendIpc('set-overlay', next);
  };

  const patchTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const addTurn = useCallback((turn: Turn) => {
    setTurns(prev => [...prev, turn]);
  }, []);

  const stopAnswer = useCallback((id: string) => {
    const running = inFlightRef.current.get(id);
    if (!running) return;
    running.controller.abort();
    inFlightRef.current.delete(id);
    patchTurn(id, running.restore);
  }, [patchTurn]);

  const addExtras = useCallback((turnId: string, question: string, answer: string) => {
    answerExtras(question, answer, loadSettings())
      .then(extras => setTurns(prev => prev.map(t => (t.id === turnId && t.answer === answer ? { ...t, ...extras } : t))))
      .catch(error => console.error('Key points / follow-ups error:', error));
  }, []);

  const answerWithAi = useCallback(async (
    turnId: string,
    question: string,
    { prepared, adjust }: { prepared?: PreparedAnswer; adjust?: { mode: AdjustMode; previous: Turn } } = {},
  ) => {
    if (adjust) {
      stopAnswer(turnId);
    } else {
      for (const id of [...inFlightRef.current.keys()]) stopAnswer(id);
    }
    const controller = new AbortController();
    const previous = adjust?.previous;
    const restore: Partial<Turn> = previous
      ? { status: 'done', answer: previous.answer, keyPoints: previous.keyPoints, followUps: previous.followUps, firstTextMs: previous.firstTextMs, provider: previous.provider }
      : { status: 'skipped', answer: '' };
    inFlightRef.current.set(turnId, { controller, restore });

    patchTurn(turnId, {
      status: 'thinking',
      source: prepared ? 'prepared' : 'ai',
      notes: prepared?.notes,
      preparedId: prepared?.id,
      firstTextMs: undefined,
      provider: undefined,
      keyPoints: undefined,
      followUps: undefined,
      error: undefined,
    });
    const startedAt = performance.now();
    const history = turnsRef.current
      .filter(t => t.id !== turnId && t.status !== 'listening')
      .map(t => ({ question: t.question, answer: t.status === 'done' ? t.answer : '', spoken: t.spoken }));
    try {
      const answer = await streamInterviewAnswer(question, history, loadSettings(), text => {
        if (!controller.signal.aborted) patchTurn(turnId, { status: 'answering', answer: text });
      }, {
        prepared,
        adjust: previous && adjust ? { mode: adjust.mode, previous: previous.answer } : undefined,
        signal: controller.signal,
        onFirstText: provider => {
          if (!controller.signal.aborted) patchTurn(turnId, { firstTextMs: Math.round(performance.now() - startedAt), provider });
        },
      });
      if (controller.signal.aborted) return;
      if (!prepared && !adjust) lastPreparedIdRef.current = null;
      if (answer) {
        patchTurn(turnId, { status: 'done', answer });
        addExtras(turnId, question, answer);
      } else {
        patchTurn(turnId, restore);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('AI error:', error);
      patchTurn(turnId, previous ? { ...restore, error: describeAiError(error) } : { status: 'error', answer: describeAiError(error) });
    } finally {
      if (inFlightRef.current.get(turnId)?.controller === controller) inFlightRef.current.delete(turnId);
    }
  }, [patchTurn, stopAnswer, addExtras]);

  const adjustAnswer = useCallback((turnId: string, mode: AdjustMode) => {
    const turn = turnsRef.current.find(t => t.id === turnId);
    if (!turn || turn.status !== 'done' || !turn.answer) return;
    const prepared = turn.preparedId ? loadSettings().answers.find(a => a.id === turn.preparedId) : undefined;
    answerWithAi(turnId, turn.question, { prepared, adjust: { mode, previous: turn } });
  }, [answerWithAi]);

  const answerFromPrepared = useCallback((turnId: string, question: string) => {
    if (!isLikelyQuestion(question)) return false;
    const match = matchPreparedAnswer(question, loadSettings().answers);
    if (!match || match.id === lastPreparedIdRef.current) return false;
    lastPreparedIdRef.current = match.id;
    answerWithAi(turnId, question, { prepared: match });
    return true;
  }, [answerWithAi]);

  const handleTranscript = useCallback((text: string, speaker: Speaker) => {
    if (speaker === 'you') {
      setTurns(prev => prev.length === 0 ? prev : prev.map((t, i) => (
        i === prev.length - 1 ? { ...t, spoken: t.spoken ? `${t.spoken} ${text}` : text } : t
      )));
      return;
    }
    lastSpeechAtRef.current = Date.now();

    let open = openTurnRef.current;
    if (open) {
      open = { id: open.id, question: `${open.question} ${text}` };
      patchTurn(open.id, { question: open.question });
    } else {
      open = { id: newId(), question: text };
      addTurn({ id: open.id, question: text, answer: '', status: 'listening' });
    }
    openTurnRef.current = open;

    if (answerFromPrepared(open.id, open.question)) {
      openTurnRef.current = null;
    }
  }, [addTurn, patchTurn, answerFromPrepared]);

  const { isRecording, startRecording, stopRecording, errorMsg, audioLevel } = useAudioCapture(handleTranscript, settings, audioSource);

  useEffect(() => {
    if (!isRecording) return;

    const timer = window.setInterval(() => {
      const open = openTurnRef.current;
      if (!open) return;
      const silentFor = Date.now() - lastSpeechAtRef.current;
      if (silentFor < PAUSE_BEFORE_ANSWER_MS) return;

      if (isLikelyQuestion(open.question)) {
        openTurnRef.current = null;
        answerWithAi(open.id, open.question);
      } else if (silentFor >= FILLER_TIMEOUT_MS) {
        openTurnRef.current = null;
        patchTurn(open.id, { status: 'skipped' });
      }
    }, 300);

    return () => clearInterval(timer);
  }, [isRecording, answerWithAi, patchTurn]);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
      const open = openTurnRef.current;
      openTurnRef.current = null;
      if (open && isLikelyQuestion(open.question)) {
        answerWithAi(open.id, open.question);
      } else if (open) {
        patchTurn(open.id, { status: 'skipped' });
      }
    } else {
      lastPreparedIdRef.current = null;
      startRecording();
    }
  };

  const [isReadingScreen, setIsReadingScreen] = useState(false);
  const readScreen = async () => {
    if (isReadingScreen) return;
    setIsReadingScreen(true);
    const id = newId();
    addTurn({ id, question: 'Reading your screen…', answer: '', status: 'thinking', origin: 'screen' });
    const fail = (message: string) => patchTurn(id, { question: 'Read from screen', status: 'error', answer: message });
    try {
      const capture = await captureScreens();
      if (!capture?.images) return fail(SCREEN_ERRORS[capture?.error ?? 'empty']);
      const question = await readQuestionFromScreen(capture.images, loadSettings());
      if (!question) return fail('No interview question found on the screen.');
      patchTurn(id, { question });
      lastPreparedIdRef.current = null;
      if (!answerFromPrepared(id, question)) answerWithAi(id, question);
    } catch (error) {
      console.error('Read screen error:', error);
      fail(describeAiError(error));
    } finally {
      setIsReadingScreen(false);
    }
  };

  const submitAsk = () => {
    const question = askText.trim();
    if (!question) return;
    setAskText('');
    lastPreparedIdRef.current = null;
    const id = newId();
    addTurn({ id, question, answer: '', status: 'thinking' });
    if (!answerFromPrepared(id, question)) answerWithAi(id, question);
  };

  const switchConversation = (target: { id: string; startedAt: number }, next: Turn[]) => {
    for (const id of [...inFlightRef.current.keys()]) stopAnswer(id);
    persistSession(turnsRef.current);
    sessionRef.current = target;
    setSession(target);
    saveCurrentSession(target);
    openTurnRef.current = null;
    lastPreparedIdRef.current = null;
    openedTurnsRef.current = next;
    setTurns(next);
  };

  const startNew = () => switchConversation(newSession(), []);

  const openSession = async (id: string) => {
    const saved = await loadSession(id);
    setIsHistoryOpen(false);
    if (!saved) {
      window.alert('That conversation could not be opened.');
      return;
    }
    switchConversation({ id: saved.id, startedAt: saved.startedAt }, closeUnfinished(saved.turns));
  };

  const shortcutRef = useRef<(action: string) => void>(() => {});
  useEffect(() => {
    shortcutRef.current = action => {
      if (!hasApiKey) return;
      if (action === 'toggle-listening') {
        if (!isMockOpen && !isCheckOpen) toggleRecording();
      }
      else if (action === 'focus-ask') askInputRef.current?.focus();
      else if (action === 'new-conversation') startNew();
      else if (action === 'read-screen') readScreen();
      else if (action === 'regenerate') {
        const last = [...turnsRef.current].reverse().find(t => t.status === 'done' && t.answer);
        if (last) adjustAnswer(last.id, 'regenerate');
      }
    };
  });
  useEffect(() => onShortcut(action => shortcutRef.current(action)), []);

  if (!hasApiKey) {
    return <OnboardingScreen onComplete={() => { reloadSettings(); setHasApiKey(true); }} />;
  }

  return (
    <div className="relative flex flex-col h-screen w-full select-none">
      {/* Header (draggable) — every button here needs real clicks */}
      <div
        data-interactive
        className="drag-area fade-with-text flex items-center justify-between gap-2 px-2.5 py-2 border-b border-slate-800 shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={toggleRecording}
            title={isRecording ? 'Stop listening' : 'Start listening'}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              isRecording ? 'bg-red-500/90 text-white hover:bg-red-500' : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {isRecording ? (
              <>
                <span className="flex items-end gap-[2px] h-3" aria-hidden>
                  {[0.15, 0.35, 0.6].map(step => (
                    <span
                      key={step}
                      className={`w-[3px] rounded-sm transition-all duration-100 ${audioLevel > step ? 'bg-white' : 'bg-white/30'}`}
                      style={{ height: `${Math.round(step * 100 + 30)}%` }}
                    />
                  ))}
                </span>
                Listening
              </>
            ) : (
              <><Mic className="w-3.5 h-3.5" /> Listen</>
            )}
          </button>
          <button
            onClick={toggleAudioSource}
            disabled={isRecording}
            title={AUDIO_SOURCES[audioSource].title}
            className="flex items-center gap-1 rounded-full border border-slate-700 px-2 py-1 text-[10px] font-medium text-slate-300 hover:border-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {audioSource === 'system' && <Volume2 className="w-3 h-3 text-emerald-400" />}
            {audioSource === 'both' && <Users className="w-3 h-3 text-sky-400" />}
            {audioSource === 'microphone' && <Mic className="w-3 h-3 text-amber-400" />}
            {AUDIO_SOURCES[audioSource].label}
          </button>
          {!isRecording && (
            <span className="hidden min-[400px]:flex items-center gap-1 text-xs font-semibold text-slate-300 truncate">
              <MessageSquareQuote className="w-3.5 h-3.5 text-blue-400 shrink-0" /> Recallr
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton
            data-display-toggle
            onClick={() => setIsDisplayOpen(open => !open)}
            title="Display and shortcuts"
            className={isDisplayOpen ? '!text-blue-400' : ''}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </IconButton>
          <IconButton
            onClick={toggleOverlay}
            title={overlay ? 'Overlay on: floating above all apps (click to unpin)' : 'Overlay off: click to float above all apps'}
            className={overlay ? '!text-blue-400' : ''}
          >
            {overlay ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
          </IconButton>
          <IconButton onClick={() => setIsSettingsOpen(true)} title="Settings (resume, answers, API key)">
            <Settings className="w-4 h-4" />
          </IconButton>
          <IconButton onClick={() => sendIpc('hide-app')} title="Hide (to system tray)">
            <Minus className="w-4 h-4" />
          </IconButton>
          <IconButton onClick={() => sendIpc('quit-app')} title="Quit" tone="danger">
            <X className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {errorMsg && (
        <div className="fade-with-text flex items-center justify-center gap-1.5 bg-red-950/60 px-3 py-1.5 text-[11px] text-red-200 border-b border-red-900">
          <MicOff className="w-3.5 h-3.5" /> {errorMsg}
        </div>
      )}

      {isDisplayOpen && (
        <div data-interactive>
          <DisplayMenu
            display={display}
            onChange={setDisplay}
            onClose={closeDisplay}
            onCheck={isRecording ? undefined : () => { setIsDisplayOpen(false); setIsCheckOpen(true); }}
            onMock={isRecording ? undefined : () => { setIsDisplayOpen(false); setIsMockOpen(true); }}
          />
        </div>
      )}

      {/* Feed contains per-turn buttons (regenerate etc.) so mark it interactive too */}
      <div data-interactive className="flex-1 min-h-0 flex flex-col">
        <ConversationFeed turns={turns} isRecording={isRecording} keyPointsView={display.keyPoints} onAdjust={adjustAnswer} onCheck={() => setIsCheckOpen(true)} onMock={() => setIsMockOpen(true)} />
      </div>

      {/* Ask form: input + buttons */}
      <form
        data-interactive
        onSubmit={e => { e.preventDefault(); submitAsk(); }}
        className="fade-with-text flex items-center gap-1.5 px-2.5 pt-2 pb-2.5 border-t border-slate-800 shrink-0"
      >
        <input
          ref={askInputRef}
          value={askText}
          onChange={e => setAskText(e.target.value)}
          placeholder="Type a question..."
          className="flex-1 bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
        />
        <IconButton type="submit" title="Get answer" disabled={!askText.trim()}>
          <SendHorizontal className="w-4 h-4" />
        </IconButton>
        <IconButton
          type="button"
          title="Read the question from your screen"
          disabled={isReadingScreen}
          onClick={readScreen}
          className={isReadingScreen ? 'animate-pulse !text-blue-400' : ''}
        >
          <ScanText className="w-4 h-4" />
        </IconButton>
        <IconButton type="button" title="History: past conversations" onClick={() => setIsHistoryOpen(true)}>
          <History className="w-4 h-4" />
        </IconButton>
        <button
          type="button"
          title="Start a new conversation (this one stays in History)"
          disabled={!turns.length}
          onClick={startNew}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <SquarePen className="w-3.5 h-3.5" /> New
        </button>
      </form>

      {/* Status bar is non-interactive — leave it click-through */}

      {isHistoryOpen && (
        <div data-interactive>
          <HistoryPanel
            currentId={session.id}
            canOpen={!isRecording}
            onOpen={openSession}
            onReview={setReviewId}
            refreshKey={reviewId}
            onClose={() => setIsHistoryOpen(false)}
          />
        </div>
      )}

      {reviewId && (
        <div data-interactive>
          <ReviewPanel sessionId={reviewId} onClose={() => setReviewId(null)} />
        </div>
      )}

      {isCheckOpen && (
        <div data-interactive>
          <SetupCheck onClose={() => setIsCheckOpen(false)} />
        </div>
      )}

      {isMockOpen && (
        <div data-interactive>
          <MockInterview onClose={() => setIsMockOpen(false)} />
        </div>
      )}

      {isSettingsOpen && (
        <div data-interactive>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} onSaved={reloadSettings} />
        </div>
      )}
    </div>
  );
}

export default App;