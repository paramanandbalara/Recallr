import { describe, expect, it } from 'vitest';
import {
  cleanSetup, describeSetup, emptySetup, estimateNegotiationMinutes, extractJsonObject, formatTranscript, MAX_REPLIES, missingSetup,
  parseHrTurn, parseNegotiationSummary, repliesSoFar,
} from './salaryNegotiation';

describe('negotiation setup', () => {
  it('needs the role, the offer and the target', () => {
    const setup = { ...emptySetup(), role: 'Backend engineer' };
    expect(missingSetup(emptySetup())).toBe('role');
    expect(missingSetup(setup)).toBe('offer');
    expect(missingSetup({ ...setup, offer: '16 LPA' })).toBe('target');
    expect(missingSetup({ ...setup, offer: '16 LPA', target: '20 LPA' })).toBeNull();
  });

  it('cleans what was typed and describes it for the recruiter', () => {
    const setup = cleanSetup({ ...emptySetup(), role: '  Data   analyst ', offer: '9 LPA', target: '12 LPA', market: 'global' as never, city: 'Pune' });
    expect(setup.role).toBe('Data analyst');
    expect(setup.market).toBe('global');
    expect(cleanSetup({ ...setup, market: 'mars' as never }).market).toBe('india');
    const text = describeSetup({ ...setup, market: 'india', company: 'Infosys' });
    expect(text).toContain('Role: Data analyst at Infosys');
    expect(text).toContain('CTC');
    expect(text).toContain("Candidate's current pay: not shared");
    expect(text).toContain('(the recruiter does NOT know this): 12 LPA');
  });

  it('estimates the listening time and counts replies', () => {
    expect(estimateNegotiationMinutes()).toBe(Math.ceil((MAX_REPLIES * 30) / 60));
    const turns = [{ who: 'hr' as const, text: 'We can offer 16.' }, { who: 'you' as const, text: 'I was hoping for 20.' }];
    expect(repliesSoFar(turns)).toBe(1);
    expect(formatTranscript(turns)).toBe('Recruiter: We can offer 16.\nCandidate: I was hoping for 20.');
  });
});

describe("the recruiter's turns", () => {
  it('reads the JSON, with fences or text around it', () => {
    expect(parseHrTurn('```json\n{"say":"Congrats! We are offering 16 LPA.","offer":"16 LPA (14 fixed + 2 variable)","done":false}\n```'))
      .toEqual({ say: 'Congrats! We are offering 16 LPA.', offer: '16 LPA (14 fixed + 2 variable)', done: false });
    expect(parseHrTurn('Here you go: {"say":"That is our final number.","done":"true"}')).toMatchObject({ say: 'That is our final number.', done: true, offer: '' });
  });

  it('takes a plain reply as speech, without labels or stage directions', () => {
    expect(parseHrTurn('Recruiter: *smiles* "Let me check with the hiring manager."')).toEqual({ say: 'Let me check with the hiring manager.', offer: '', done: false });
    expect(parseHrTurn('')).toEqual({ say: '', offer: '', done: false });
  });
});

describe('the coach’s verdict', () => {
  it('reads every part and keeps the score in range', () => {
    const summary = parseNegotiationSummary(JSON.stringify({
      score: 11.4, verdict: 'Solid anchor.', worked: ['Anchored high', ''], costMoney: ['Shared current CTC early'],
      betterPhrasings: [{ instead: 'Okay fine', say: 'Could we move 2 L from variable into fixed?' }, 'Ask about the joining bonus.', { instead: 'x' }],
      finalDeal: '18 LPA fixed + 1 L joining bonus',
    }));
    expect(summary).toEqual({
      score: 10, verdict: 'Solid anchor.', worked: ['Anchored high'], costMoney: ['Shared current CTC early'],
      betterPhrasings: [{ instead: 'Okay fine', say: 'Could we move 2 L from variable into fixed?' }, { instead: '', say: 'Ask about the joining bonus.' }],
      finalDeal: '18 LPA fixed + 1 L joining bonus',
    });
  });

  it('falls back safely on a broken reply', () => {
    expect(parseNegotiationSummary('not json')).toEqual({ score: 5, verdict: '', worked: [], costMoney: [], betterPhrasings: [], finalDeal: 'No deal was agreed.' });
    expect(parseNegotiationSummary('{"score":0}').score).toBe(1);
    expect(extractJsonObject('[1,2]')).toBeNull();
  });
});
