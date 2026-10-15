import React from 'react';

// A blog post's text: "## " headings, "- " bullets, ``` code blocks and paragraphs (the same format the server pre-renders)
export const ArticleBody: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      blocks.push(<pre key={i} className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm leading-6 text-slate-200"><code>{code.join('\n')}</code></pre>);
    } else if (/^#{2,3} /.test(line)) {
      blocks.push(<h2 key={i} className="!mt-10 text-2xl font-semibold tracking-tight text-white">{line.replace(/^#+ /, '')}</h2>);
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*] /, ''));
      i--;
      blocks.push(
        <ul key={i} className="space-y-2 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex gap-3 text-slate-300"><span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />{item}</li>
          ))}
        </ul>,
      );
    } else if (line.trim()) {
      blocks.push(<p key={i} className="text-slate-300">{line}</p>);
    }
  }
  return <div className={`space-y-5 text-[17px] leading-8 ${className}`}>{blocks}</div>;
};

// About 200 words a minute
export const readingTime = (text: string) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));
