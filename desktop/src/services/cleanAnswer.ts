// Cleans an AI answer so it reads like a person talking: no markdown, long dashes, filler openers, AI words,
// hedges or generic "you". Code blocks and `names` in backticks are never changed.

// AI-sounding words the model still slips in, swapped for what a person would say (spoken text only, never code)
const PLAIN_WORDS: [string, string][] = [
  ['utilize', 'use'], ['utilizes', 'uses'], ['utilized', 'used'], ['utilizing', 'using'],
  ['leverage', 'use'], ['leverages', 'uses'], ['leveraged', 'used'], ['leveraging', 'using'],
  ['ensure', 'make sure'], ['ensures', 'makes sure'], ['ensured', 'made sure'], ['ensuring', 'making sure'],
  ['enhance', 'improve'], ['enhances', 'improves'], ['enhanced', 'improved'], ['enhancing', 'improving'],
  ['facilitate', 'help'], ['facilitates', 'helps'], ['facilitated', 'helped'], ['facilitating', 'helping'],
  ['streamline', 'simplify'], ['streamlines', 'simplifies'], ['streamlined', 'simplified'], ['streamlining', 'simplifying'],
  ['showcase', 'show'], ['showcases', 'shows'], ['showcased', 'showed'], ['showcasing', 'showing'],
  ['spearheaded', 'led'], ['spearheading', 'leading'], ['commenced', 'started'], ['commence', 'start'],
  ['delve into', 'get into'], ['delved into', 'got into'], ['delving into', 'getting into'], ['dive into', 'get into'],
  ['furthermore', 'also'], ['moreover', 'also'], ['additionally', 'also'], ['notably', 'especially'],
  ['essentially', 'basically'], ['in essence', 'basically'], ['in order to', 'to'],
  ['crucial', 'important'], ['pivotal', 'key'], ['paramount', 'really important'], ['optimal', 'best'],
  ['robust', 'solid'], ['seamless', 'smooth'], ['seamlessly', 'smoothly'], ['meticulous', 'careful'], ['meticulously', 'carefully'],
  ['under the hood', 'internally'], ['behind the scenes', 'internally'], ['out of the box', 'by default'],
  ['comprehensive', 'full'], ['numerous', 'many'], ['a plethora of', 'a lot of'], ['a myriad of', 'a lot of'],
  // Long, hard-to-say words with a short everyday one
  ['approximately', 'about'], ['subsequently', 'then'], ['consequently', 'so'], ['nevertheless', 'still'], ['nonetheless', 'still'],
  ['demonstrate', 'show'], ['demonstrates', 'shows'], ['demonstrated', 'showed'], ['demonstrating', 'showing'],
  ['methodology', 'method'], ['methodologies', 'methods'], ['utilization', 'use'], ['predominantly', 'mostly'], ['primarily', 'mainly'],
  ['prior to', 'before'], ['subsequent to', 'after'], ['with respect to', 'about'], ['in regards to', 'about'], ['with regard to', 'about'],
  ['significantly', 'a lot'], ['substantially', 'a lot'], ['endeavor', 'try'], ['endeavour', 'try'], ['ascertain', 'find out'],
  ['intricacies', 'details'], ['aforementioned', 'that'], ['initiated', 'started'], ['initiate', 'start'], ['initiating', 'starting'],
  ['therefore', 'so'], ['thereby', 'so'], ['accordingly', 'so'],
];
const PLAIN_WORD_PATTERN = new RegExp(`\\b(${PLAIN_WORDS.map(([word]) => word).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi');
const PLAIN_WORD_MAP = new Map(PLAIN_WORDS);

// Words before "you" that mean it's really the interviewer ("thank you", "as you said", "can you")
const INTERVIEWER_YOU = new Set(['thank', 'thanking', 'as', 'do', 'does', 'did', 'would', 'could', 'can', 'will', 'are', 'were', 'have', 'has', 'told', 'asked']);
// Words after which "you" is the object ("gives you", "for you")
const OBJECT_BEFORE = new Set([
  'give', 'gives', 'gave', 'giving', 'let', 'lets', 'help', 'helps', 'helped', 'allow', 'allows', 'tell', 'tells', 'make', 'makes',
  'cost', 'costs', 'save', 'saves', 'take', 'takes', 'get', 'gets', 'send', 'sends', 'force', 'forces', 'stop', 'stops', 'protect',
  'protects', 'warn', 'warns', 'notify', 'notifies', 'remind', 'reminds', 'charge', 'charges', 'hit', 'hits', 'block', 'blocks',
  'for', 'to', 'with', 'from', 'at', 'on', 'by', 'of', 'about', 'into', 'than', 'like', 'around', 'without', 'toward', 'towards',
  'between', 'against', 'after', 'before',
]);

const plainWords = (text: string) => text
  .replace(PLAIN_WORD_PATTERN, match => {
    const plain = PLAIN_WORD_MAP.get(match.toLowerCase()) ?? match;
    return match[0] === match[0].toUpperCase() ? plain.charAt(0).toUpperCase() + plain.slice(1) : plain;
  })
  .replace(/(^|[.!?]\s+)(?:honestly|to be honest),\s*(\w)/gi, (_m, before: string, next: string) => before + next.toUpperCase())
  .replace(/\b(?:honestly|to be honest),\s*/gi, '')
  .replace(/,\s*(?:honestly|to be honest)\b/gi, '')
  // Hedges ("I think", "probably") at the start of a sentence or as an aside
  // ("I think about…", where "think" is the real verb, stays)
  .replace(/(^|[.!?]\s+)(?:I think|I guess|I believe|I feel like|probably),?\s+(?!(?:about|of|through|back|over)\b)(\w)/gi,
    (_m, before: string, next: string) => before + next.toUpperCase())
  .replace(/,\s*(?:I think|I guess|I believe),\s*/gi, ' ')
  // Generic "you" in speech: as the subject it becomes "we" ("you don't want to index everything" → "we don't…"),
  // as the object "me" ("it gives you more control" → "it gives me…"). Left alone where it's really the interviewer
  // ("thank you", "as you mentioned", "can you").
  .replace(/\b(you[’']re|you[’']ve|you[’']d|you[’']ll|yourselves|yourself|yours|your|you)\b/gi,
    (match: string, _word: string, offset: number, text: string) => {
      const lower = match.toLowerCase();
      const capital = (word: string) => (match[0] === 'Y' ? word.charAt(0).toUpperCase() + word.slice(1) : word);
      if (lower === 'you') {
        const previous = text.slice(Math.max(0, offset - 20), offset).match(/(\w+)\s+$/)?.[1].toLowerCase() ?? '';
        if (INTERVIEWER_YOU.has(previous)) return match;
        const next = text.slice(offset + match.length).match(/^\s*([\w.,!?;:]?)/)?.[1] ?? '';
        if (OBJECT_BEFORE.has(previous) || /^[.,!?;:]?$/.test(next)) return capital('me');
        return capital('we');
      }
      return capital(/^yoursel/.test(lower) ? 'ourselves' : lower.startsWith('your') ? `our${lower.slice(4)}` : `we${lower.slice(3)}`);
    })
  // "kind of" / "sort of" as a hedge ("it's kind of slow"), but not as real wording ("what kind of database")
  .replace(/(?<!\b(?:what|this|that|these|those|the|a|an|any|some|every|which|one|same|other|different|each|no|many|all|my|our|your|their|his|her|its|what's)\s)\b(?:kind|sort) of\s+/gi, '');

// Leaves `names` in backticks alone
export const plainWordsOutsideCode = (line: string) =>
  line.split(/(`[^`]*`)/).map(part => (part.startsWith('`') ? part : plainWords(part))).join('');

// Filler a model opens with even when told not to ("Sure, honestly, ..."); removed from the start of an answer
const FILLER_OPENER = /^(?:(?:sure|yeah|yes|so|well|okay|ok|right|honestly|of course|absolutely|certainly|great question|good question|that's a (?:great|good) question|thanks for asking(?: that)?|thank you for asking(?: that)?)(?:\s*[,.!:]+|\s+[—-]+)\s*)+/i;

export const stripFillerOpener = (text: string) => {
  const stripped = text.replace(FILLER_OPENER, '');
  return stripped === text || !stripped ? text : stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

// Plain spoken text: strip quotes, any markdown the model slipped in, long dashes and filler openers. Code blocks are kept exactly.
export const cleanAnswer = (text: string) => {
  const lines: string[] = [];
  let inCode = false;
  for (const raw of text.trim().replace(/^"|"$/g, '').split('\n')) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      lines.push(raw.trim());
    } else if (inCode) {
      lines.push(raw.replace(/\s+$/, ''));
    } else {
      const line = raw.trim()
        .replace(/\*\*|__/g, '')
        .replace(/^#+\s*/, '')
        .replace(/^[-*•]\s+/, '')
        .replace(/\s*—\s*/g, ', ');
      if (line) lines.push(plainWordsOutsideCode(line));
    }
  }
  return stripFillerOpener(lines.join('\n'));
};
