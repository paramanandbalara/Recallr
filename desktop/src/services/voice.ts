// Picking the voice that reads interview questions out loud. System voices differ a lot: macOS has novelty voices
// ("Bubbles", "Zarvox"), Linux often only has a robotic eSpeak, and network voices don't work in Electron.
// So: an English voice, natural-sounding ones first, installed (local) ones over network ones.

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

// Voices that read clearly; the "Natural"/"Neural"/"Premium"/"Enhanced" variants sound the most human
const GOOD = /natural|neural|premium|enhanced|samantha|alex|daniel|karen|moira|tessa|rishi|veena|serena|ava|allison|susan|aria|jenny|guy|heera|ravi|neerja|prabhat|zira|david|mark|hazel|george|google (?:us|uk) english/i;
const NATURAL = /natural|neural|premium|enhanced/i;
// macOS novelty voices and robotic engines
const BAD = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|espeak|mbrola/i;
const ACCENTS = ['en-us', 'en-gb', 'en-in', 'en-au', 'en-ca', 'en-ie'];

export const voiceScore = (voice: VoiceLike) => {
  const lang = voice.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return -Infinity;
  let score = 0;
  const accent = ACCENTS.indexOf(lang);
  score += accent >= 0 ? 10 - accent : 3;
  if (GOOD.test(voice.name)) score += 20;
  if (NATURAL.test(voice.name)) score += 10;
  if (BAD.test(voice.name)) score -= 40;
  if (voice.localService) score += 15; // Network voices often fail silently in Electron
  if (voice.default) score += 2;
  return score;
};

// The best English voice, or null when there's none (the system default is used then, told to speak English)
export const pickEnglishVoice = <V extends VoiceLike>(voices: readonly V[]): V | null => {
  let best: V | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const score = voiceScore(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return bestScore === -Infinity ? null : best;
};

// The system's voices, waiting briefly for them: Chromium loads them a moment after startup
export const loadVoices = (timeoutMs = 1000): Promise<SpeechSynthesisVoice[]> => new Promise(resolve => {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return resolve([]);
  const now = synth.getVoices();
  if (now.length) return resolve(now);
  const done = () => {
    clearTimeout(timer);
    synth.removeEventListener('voiceschanged', done);
    resolve(synth.getVoices());
  };
  const timer = setTimeout(done, timeoutMs);
  synth.addEventListener('voiceschanged', done);
});

// Read text out loud in English; resolves when done (or right away if speech isn't available)
export const speakEnglish = async (text: string) => {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  const voice = pickEnglishVoice(await loadVoices());
  await new Promise<void>(resolve => {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-US'; // Otherwise a Hindi app language could pick a Hindi voice
    utterance.rate = 0.97;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    synth.speak(utterance);
  });
};
