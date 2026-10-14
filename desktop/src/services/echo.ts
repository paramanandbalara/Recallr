// Echo: with "Call + mic", the mic also hears the interviewer through the speakers

export const ECHO_WINDOW_MS = 15000;
const words = (text: string) => text.toLowerCase().match(/[a-z0-9']{3,}/g) ?? [];

// Mic speech whose words mostly match what the call said just before is the speakers' echo, not the user
export const isEcho = (micText: string, recentCall: { text: string; at: number }[]) => {
  const micWords = words(micText);
  if (micWords.length === 0) return false;
  const callWords = new Set(recentCall.filter(c => Date.now() - c.at < ECHO_WINDOW_MS).flatMap(c => words(c.text)));
  const shared = micWords.filter(w => callWords.has(w)).length;
  return shared / micWords.length >= 0.6;
};
