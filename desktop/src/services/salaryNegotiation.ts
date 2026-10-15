// Salary negotiation practice: the setup, the AI recruiter's turns and the coach's verdict.
// Helpers that don't need the AI or the browser (so they're tested in node); the AI calls are in practiceAi.ts.

export type Market = 'india' | 'global';

export interface NegotiationSetup {
  role: string;
  company: string;      // The hiring company, from the profile ('' if none)
  city: string;
  market: Market;       // India: CTC, fixed vs variable, joining bonus, notice buy-out, ESOPs. Global: base, bonus, equity, sign-on
  currentCtc: string;   // Optional, as the user writes it: "12 LPA", "₹12,00,000", "$95k"
  offer: string;        // What the recruiter opens with
  target: string;       // What the user wants
  noticePeriod: string; // "60 days", "Immediate"
  otherOffers: string;  // Optional
}

export interface NegotiationTurn {
  who: 'hr' | 'you';
  text: string;
}

// One reply from the recruiter
export interface HrTurn {
  say: string;   // What the recruiter says out loud
  offer: string; // The offer on the table after this turn, in a few words ('' if unchanged or unclear)
  done: boolean; // The conversation is over: agreed, walked away, or "we'll get back to you"
}

export interface BetterPhrasing {
  instead: string; // What the user said
  say: string;     // What would have worked better
}

export interface NegotiationSummary {
  score: number;          // 1..10
  verdict: string;        // One or two sentences
  worked: string[];       // What worked
  costMoney: string[];    // What cost them money
  betterPhrasings: BetterPhrasing[];
  finalDeal: string;      // The deal reached (or where it ended)
}

// The user's replies: at least this many before the recruiter wraps up (unless they accept outright), at most this many
export const MIN_REPLIES = 5;
export const MAX_REPLIES = 8;

// A typical spoken negotiation reply; only the time spent answering is listened to
export const TYPICAL_REPLY_SECONDS = 30;
export const estimateNegotiationMinutes = (replies = MAX_REPLIES) => Math.max(1, Math.ceil((replies * TYPICAL_REPLY_SECONDS) / 60));

export const emptySetup = (): NegotiationSetup => ({
  role: '', company: '', city: '', market: 'india', currentCtc: '', offer: '', target: '', noticePeriod: '', otherOffers: '',
});

const oneLine = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

export const cleanSetup = (setup: NegotiationSetup): NegotiationSetup => ({
  role: oneLine(setup.role, 200),
  company: oneLine(setup.company, 200),
  city: oneLine(setup.city, 100),
  market: setup.market === 'global' ? 'global' : 'india',
  currentCtc: oneLine(setup.currentCtc, 60),
  offer: oneLine(setup.offer, 60),
  target: oneLine(setup.target, 60),
  noticePeriod: oneLine(setup.noticePeriod, 60),
  otherOffers: oneLine(setup.otherOffers, 500),
});

// The first required field still empty, or null when the role-play can start
export const missingSetup = (setup: NegotiationSetup): 'role' | 'offer' | 'target' | null => {
  if (!setup.role.trim()) return 'role';
  if (!setup.offer.trim()) return 'offer';
  if (!setup.target.trim()) return 'target';
  return null;
};

// The setup as plain lines for the prompts
export const describeSetup = (s: NegotiationSetup) => [
  `Role: ${s.role || 'not given'}${s.company ? ` at ${s.company}` : ''}`,
  `City: ${s.city || 'not given'}`,
  `Market: ${s.market === 'india' ? 'India (talk in CTC and LPA; fixed vs variable pay, joining bonus, notice period buy-out, ESOPs, relocation)' : 'Global (base salary, annual bonus, equity/RSUs, sign-on bonus, start date)'}`,
  `Candidate's current pay: ${s.currentCtc || 'not shared'}`,
  `Offer the recruiter opens with: ${s.offer}`,
  `What the candidate wants (the recruiter does NOT know this): ${s.target}`,
  `Notice period: ${s.noticePeriod || 'not given'}`,
  `Other offers the candidate has: ${s.otherOffers || 'none mentioned'}`,
].join('\n');

// The conversation so far as a transcript
export const formatTranscript = (turns: NegotiationTurn[]) =>
  turns.map(turn => `${turn.who === 'hr' ? 'Recruiter' : 'Candidate'}: ${turn.text}`).join('\n');

export const repliesSoFar = (turns: NegotiationTurn[]) => turns.filter(turn => turn.who === 'you').length;

// ---------- Parsing the AI's answers ----------

const asText = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

// The JSON object in a reply, even with ```json fences or a sentence around it; null if there isn't one
export const extractJsonObject = (raw: string): Record<string, unknown> | null => {
  const text = (raw ?? '').replace(/```(?:json)?/gi, '').trim();
  const tryParse = (s: string) => {
    try {
      const value = JSON.parse(s);
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
    } catch {
      return null;
    }
  };
  const whole = tryParse(text);
  if (whole) return whole;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? tryParse(text.slice(start, end + 1)) : null;
};

const isTrue = (value: unknown) => value === true || (typeof value === 'string' && /^(true|yes)$/i.test(value.trim()));

// Speech only: no "Recruiter:" label, quotes or stage directions like *smiles*
const cleanLine = (text: string) => text
  .replace(/^\s*(?:recruiter|hr|interviewer)\s*:\s*/i, '')
  .replace(/\*[^*]{1,40}\*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^["“]+|["”]+$/g, '')
  .trim();

// The recruiter's turn. A reply that isn't JSON is taken as what they say, so the role-play keeps going.
export const parseHrTurn = (raw: string): HrTurn => {
  const data = extractJsonObject(raw);
  if (!data) return { say: cleanLine(raw ?? '').slice(0, 1200), offer: '', done: false };
  return {
    say: cleanLine(asText(data.say ?? data.reply ?? data.text ?? data.message)).slice(0, 1200),
    offer: asText(data.offer ?? data.currentOffer).slice(0, 200),
    done: isTrue(data.done ?? data.closed ?? data.final),
  };
};

const list = (value: unknown, max: number) => (Array.isArray(value) ? value.map(asText).filter(Boolean).slice(0, max) : []);

export const parseNegotiationSummary = (raw: string): NegotiationSummary => {
  const data = extractJsonObject(raw) ?? {};
  const score = Math.round(Number(data.score));
  const phrasings = (Array.isArray(data.betterPhrasings) ? data.betterPhrasings : Array.isArray(data.phrasings) ? data.phrasings : [])
    .map((item: unknown): BetterPhrasing | null => {
      if (typeof item === 'string') return asText(item) ? { instead: '', say: asText(item) } : null;
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const say = asText(o.say ?? o.better ?? o.try);
      return say ? { instead: asText(o.instead ?? o.said ?? o.original), say } : null;
    })
    .filter((p: BetterPhrasing | null): p is BetterPhrasing => !!p)
    .slice(0, 5);
  return {
    score: Number.isFinite(score) ? Math.min(10, Math.max(1, score)) : 5,
    verdict: asText(data.verdict ?? data.summary),
    worked: list(data.worked ?? data.good, 5),
    costMoney: list(data.costMoney ?? data.cost ?? data.mistakes, 5),
    betterPhrasings: phrasings,
    finalDeal: asText(data.finalDeal ?? data.deal) || 'No deal was agreed.',
  };
};
