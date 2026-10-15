import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import kotlin from 'highlight.js/lib/languages/kotlin';
import rust from 'highlight.js/lib/languages/rust';
import { t } from '../i18n';

// Only the languages interview questions usually need, to keep the app small
const LANGUAGES = { sql, javascript, typescript, python, java, csharp, cpp, go, bash, json, yaml, xml, css, php, ruby, kotlin, rust };
for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);

type Segment =
  | { kind: 'text'; lines: string[] }
  | { kind: 'code'; language: string; code: string };

// Split an answer into spoken text and ``` code blocks (a block still being streamed counts too)
const parseAnswer = (text: string): Segment[] => {
  const segments: Segment[] = [];
  let code: { language: string; lines: string[] } | null = null;
  for (const line of text.split('\n')) {
    const fence = line.match(/^\s*```\s*([\w+#.-]*)/);
    if (fence && !code) {
      code = { language: fence[1].toLowerCase(), lines: [] };
    } else if (fence && code) {
      segments.push({ kind: 'code', language: code.language, code: code.lines.join('\n') });
      code = null;
    } else if (code) {
      code.lines.push(line);
    } else {
      const last = segments[segments.length - 1];
      if (last?.kind === 'text') last.lines.push(line);
      else segments.push({ kind: 'text', lines: [line] });
    }
  }
  if (code) segments.push({ kind: 'code', language: code.language, code: code.lines.join('\n') });
  return segments;
};

const highlight = (code: string, language: string) => {
  try {
    return hljs.getLanguage(language)
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(code).value;
  } catch {
    return null;
  }
};

// `names` in spoken text get a light highlight
const InlineText: React.FC<{ line: string }> = ({ line }) => (
  <>
    {line.split(/(`[^`\n]+`)/).map((part, i) => (
      part.length > 2 && part.startsWith('`') && part.endsWith('`')
        ? <code key={i} className="rounded bg-slate-800 px-1 py-px font-mono text-[0.9em] text-sky-300">{part.slice(1, -1)}</code>
        : <React.Fragment key={i}>{part}</React.Fragment>
    ))}
  </>
);

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const html = highlight(code, language);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-slate-800 px-2.5 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{language || t('code')}</span>
        <button
          title={t('Copy code')}
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="p-0.5 rounded text-slate-500 hover:text-slate-200"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      <pre className="code-block whitespace-pre-wrap break-words px-3 py-2 font-mono text-[0.85em] leading-relaxed text-slate-200">
        {html !== null ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
    </div>
  );
};

const Cursor = () => <span className="ml-0.5 inline-block w-[2px] h-[1em] align-[-2px] bg-blue-400 animate-pulse" />;

// Shows the answer as it streams in, with a cursor while more is coming
export const AnswerText: React.FC<{ text: string; streaming: boolean }> = ({ text, streaming }) => {
  const segments = parseAnswer(text);
  if (segments.length === 0) return streaming ? <p><Cursor /></p> : null;
  return (
    <div className="space-y-2">
      {segments.map((segment, s) => {
        const isLast = s === segments.length - 1;
        if (segment.kind === 'code') {
          return (
            <React.Fragment key={s}>
              <CodeBlock code={segment.code} language={segment.language} />
              {streaming && isLast && <Cursor />}
            </React.Fragment>
          );
        }
        return segment.lines.map((line, i) => (
          <p key={`${s}-${i}`}>
            <InlineText line={line} />
            {streaming && isLast && i === segment.lines.length - 1 && <Cursor />}
          </p>
        ));
      })}
    </div>
  );
};
