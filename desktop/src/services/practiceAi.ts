import { completeChat } from './llm';
import type { Settings } from './storage';
import {
  describeSetup, formatTranscript, MAX_REPLIES, MIN_REPLIES, parseHrTurn, parseNegotiationSummary, repliesSoFar,
  type HrTurn, type NegotiationSetup, type NegotiationSummary, type NegotiationTurn,
} from './salaryNegotiation';
import { parseReplayFeedback, type ReplayFeedback, type ReplayQuestion } from './answerReplay';

// The AI calls for salary negotiation practice and answer replay. They go through the server's /api/ai/chat like
// every other AI call, so the tokens count against the user's plan. None of this is on the live answer path.

const PLAIN_SPEECH = `Write the way people really talk: plain everyday words, short sentences, contractions. No long dashes, no semicolons,
no markdown, no emojis, and no AI phrases ("Certainly", "Great question", "I'd be happy to", "leverage", "ensure", "delve").`;

// ---------- Salary negotiation ----------

const recruiterSystem = (setup: NegotiationSetup) => `You play an experienced HR recruiter on a phone call, making a job offer and negotiating salary
with the candidate. This is a realistic practice role-play: stay in character the whole time and never coach the candidate.

[THE OFFER]
${describeSetup(setup)}

HOW TO PLAY IT
- Open by congratulating them briefly and making the offer in concrete numbers${setup.market === 'india'
    ? ', the way Indian recruiters do: total CTC in LPA, split into fixed and variable (variable is usually 10 to 20 percent), plus any joining bonus, and ask for their notice period'
    : ': base salary, target bonus, equity if any, and the start date'}.
- React to exactly what the candidate just said. Push back the way real recruiters do: "this is already at the top of the band",
  "we have to keep parity with the team", "the variable is almost always paid out", "we need you to join in 30 days".
- Give ground only when the candidate gives a good reason (other offers, market data, their skills, current pay, a counter-offer), and in small steps.
  Prefer to move the cheaper levers first${setup.market === 'india'
    ? ': a one-time joining bonus, notice period buy-out, relocation, ESOPs, moving variable into fixed, an early salary review after 6 months'
    : ': a sign-on bonus, more equity, an earlier review, extra leave, a later start date'}.
- Never go far above the candidate's target, and don't give everything they ask straight away. A realistic final number is usually between the
  first offer and what they asked for. If they ask for something unrealistic, say so politely and hold firm.
- If they share their current pay, recruiters often try to anchor on it ("that's already a 40 percent hike"). If they mention a notice period
  longer than 30 days, ask whether they can negotiate it or whether a buy-out works.
- Keep each turn short, like real speech on a call: 1 to 4 sentences, one point at a time, and usually end with a question back to them.
- The candidate should get at least ${MIN_REPLIES} replies before you wrap up, unless they clearly accept the offer as it stands.
  By their ${MAX_REPLIES}th reply you must wrap up: state the final offer (or that you'll check internally and get back) and close politely.
${PLAIN_SPEECH}
Return JSON only: {"say":"what you say out loud","offer":"the offer on the table now in a few words, e.g. 18 LPA (16 fixed + 2 variable) + 1 L joining bonus","done":false}
Set "done" to true only on the turn that ends the call (deal agreed, final offer stated, or they walked away).`;

// The recruiter's next line, given the conversation so far (an empty conversation opens the call)
export const negotiationHrTurn = async (setup: NegotiationSetup, turns: NegotiationTurn[], signal?: AbortSignal): Promise<HrTurn> => {
  const replies = repliesSoFar(turns);
  const stage = !turns.length
    ? 'Open the call and make the offer.'
    : replies >= MAX_REPLIES
      ? `That was the candidate's last reply (${replies} of ${MAX_REPLIES}). Wrap up now: state the final offer and close the call, with "done": true.`
      : `The candidate has replied ${replies} time${replies === 1 ? '' : 's'} (of at most ${MAX_REPLIES}). Reply to what they just said.`;
  const raw = await completeChat({
    tier: 'fast',
    json: true,
    system: recruiterSystem(setup),
    user: `${turns.length ? `[THE CALL SO FAR]\n${formatTranscript(turns)}\n\n` : ''}${stage}`,
    temperature: 0.8,
    maxTokens: 600,
    signal,
  });
  const turn = parseHrTurn(raw);
  return replies >= MAX_REPLIES ? { ...turn, done: true } : turn;
};

// The coach's verdict once the call is over
export const negotiationDebrief = async (setup: NegotiationSetup, turns: NegotiationTurn[]): Promise<NegotiationSummary> => {
  const raw = await completeChat({
    tier: 'quality',
    json: true,
    system: `You are a salary negotiation coach${setup.market === 'india' ? ' who knows Indian offers well (CTC, fixed vs variable, joining bonus, notice buy-out, ESOPs)' : ''}.
The candidate just practised negotiating a job offer with a recruiter (played by an AI). You get the setup and the call transcript
(the candidate's lines are speech-to-text, so ignore small transcription errors). Be honest and specific, like a good human coach.
[SETUP]
${describeSetup(setup)}
Return JSON only:
{"score":7,"verdict":"...","worked":["..."],"costMoney":["..."],"betterPhrasings":[{"instead":"what they said","say":"what to say instead"}],"finalDeal":"..."}
- "score": 1 to 10 for how well they negotiated: anchoring, reasons given, not accepting too fast, asking about all the levers, staying polite and firm.
- "verdict": one or two sentences on how it went overall.
- "worked": 1 to 4 specific things they did well (quote them briefly where it helps).
- "costMoney": 1 to 4 specific moments or habits that cost them money or leverage (accepting too early, sharing current pay without need,
  naming a number below their target, ignoring the variable or joining bonus, agreeing to a short notice period without a buy-out, and so on).
- "betterPhrasings": 2 to 4 lines they said, each with a stronger way to say it that they could use word for word in a real call.
- "finalDeal": the deal reached in one line, with the numbers (fixed, variable, bonus, joining date), or where it was left if there was no deal.
${PLAIN_SPEECH}`,
    user: formatTranscript(turns) || 'The candidate did not say anything.',
    temperature: 0.3,
    maxTokens: 2500,
  });
  return parseNegotiationSummary(raw);
};

// ---------- Answer replay ----------

const MAX_CV_CHARS = 8000;
const MAX_JOB_CHARS = 4000;

// A stronger version of what the user said to each question, in one call (counted once against the plan)
export const answerReplayFeedback = async (questions: ReplayQuestion[], settings: Settings): Promise<(ReplayFeedback | undefined)[]> => {
  const spoken = questions.filter(q => q.spoken);
  if (!spoken.length) return questions.map(() => undefined);
  const raw = await completeChat({
    tier: 'quality',
    json: true,
    system: `You coach a candidate right after a real job interview. For each question you get what the candidate actually said
(speech-to-text heard on their microphone, so ignore small transcription errors, filler words and cut-off starts).
Be honest and specific, like a good human coach, not generous by default.
Return JSON only: {"answers":[{"n":1,"score":6,"good":"...","fix":"...","better":"..."}]} with one entry per question, "n" being its number.
- "score": 1 to 10 for how well what they said would land with the interviewer (answered the question, a concrete example or evidence, clarity, length).
- "good": one sentence on what was good. "fix": the one or two changes that would help most.
- "better": a stronger version of THEIR answer that they could say next time: keep their story and facts, add only facts from the resume,
  60 to 150 words, natural spoken English in the first person.
${PLAIN_SPEECH}
[RESUME]
${settings.cv.slice(0, MAX_CV_CHARS) || 'Not provided'}
[JOB]
${settings.job.slice(0, MAX_JOB_CHARS) || 'Not provided'}${settings.company.trim() ? `\nCompany: ${settings.company.trim()}` : ''}`,
    user: spoken.map((q, i) => `${i + 1}. Question: ${q.question}\nWhat the candidate said: ${q.spoken.slice(0, 3000)}`).join('\n\n'),
    temperature: 0.3,
    maxTokens: 6000,
  });
  const feedback = parseReplayFeedback(raw, spoken);
  return questions.map(q => (q.spoken ? feedback[spoken.indexOf(q)] : undefined));
};
