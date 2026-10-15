import React, { useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Loader2, Mic, Plus, RotateCcw } from 'lucide-react';
import { prepPack, type PrepItem } from '../services/ai';
import { fetchCommonQuestions } from '../services/account';
import { describeAiError } from '../services/llm';
import { newId, type PreparedAnswer, type Settings } from '../services/storage';
import { t } from '../i18n';
import { Button, IconButton } from './ui';

const KIND_LABELS: Record<PrepItem['kind'], string> = {
  'about-you': 'About you', experience: 'Experience', coding: 'Coding', design: 'System design', concept: 'Technical', other: 'General',
};

interface Props {
  settings: Settings;
  onAdd: (answers: PreparedAnswer[]) => void; // Add the chosen ones to the prepared answers
  onPractise?: (questions: string[]) => void; // Start a mock interview with them
  onClose: () => void;
}

// The questions this job will likely bring up, each with why and a drafted answer, to choose from
export const PrepPack: React.FC<Props> = ({ settings, onAdd, onPractise, onClose }) => {
  const [items, setItems] = useState<PrepItem[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(0);

  const existing = new Set(settings.answers.map(a => a.question.trim().toLowerCase()));

  const build = async () => {
    setBusy(true);
    setError('');
    setAdded(0);
    try {
      const common = await fetchCommonQuestions().catch(() => []); // Fine without them
      const list = await prepPack(settings, common);
      if (!list.length) throw new Error(t('No questions came back. Try again.'));
      setItems(list);
      setChosen(new Set(list.map((item, i) => (existing.has(item.question.trim().toLowerCase()) ? -1 : i)).filter(i => i >= 0)));
    } catch (err) {
      setError(describeAiError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) => setChosen(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });

  const picked = items?.filter((_, i) => chosen.has(i)) ?? [];
  const add = () => {
    onAdd(picked.map(item => ({ id: newId(), question: item.question, notes: item.why || undefined, answer: item.answer })));
    setAdded(picked.length);
    setChosen(new Set());
  };

  return (
    <div className="panel-in absolute inset-0 z-[55] flex flex-col bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <IconButton onClick={onClose} title={t('Back')}><ArrowLeft className="w-4 h-4" /></IconButton>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100">{t('Prep pack')}</h2>
          <p className="truncate text-[10px] text-slate-500">{settings.company ? `${settings.company} · ` : ''}{t('likely questions, with answers from your resume and stories')}</p>
        </div>
      </div>

      <div className="scrollable flex-1 min-h-0 space-y-3 overflow-y-auto p-4">
        {!items && !busy && (
          <div className="space-y-3 text-xs leading-relaxed text-slate-400">
            <p>{t('Recallr reads the job description, your resume and your story bank, adds the questions asked most in real interviews, and predicts what this interview will ask, with an answer to each in your words.')}</p>
            <p>{t('You choose which ones to keep. They go into your prepared answers, so they show up instantly when the question comes.')}</p>
            {!settings.job.trim() && <p className="text-amber-300">{t('Add the job description in the Profile tab for a much better pack.')}</p>}
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={build}>{t('Build my prep pack')}</Button>
          </div>
        )}
        {busy && (
          <div className="flex flex-col items-center gap-2 pt-12 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <p className="text-xs text-slate-400">{t('Working out the likely questions and drafting answers. This can take up to a minute.')}</p>
          </div>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
        {added > 0 && <p className="flex items-center gap-1.5 text-xs text-emerald-300"><Check className="w-3.5 h-3.5" /> {t('Added {n} to your prepared answers.', { n: added })}</p>}

        {items && !busy && (
          <ul className="space-y-1.5">
            {items.map((item, i) => {
              const already = existing.has(item.question.trim().toLowerCase());
              return (
                <li key={i} className="list-in rounded-lg border border-slate-800" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                  <div className="flex items-start gap-2 p-2.5">
                    <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} disabled={already} className="mt-0.5 accent-blue-500" />
                    <button onClick={() => setOpen(open === i ? null : i)} className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-medium text-slate-100">{item.question}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="rounded bg-slate-800 px-1.5 py-px font-semibold uppercase tracking-wide text-slate-400">{t(KIND_LABELS[item.kind])}</span>
                        {already ? t('Already in your answers') : item.why}
                      </span>
                    </button>
                    <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open === i ? 'rotate-180' : ''}`} />
                  </div>
                  {open === i && <p className="border-t border-slate-800 px-3 py-2 text-xs leading-relaxed text-slate-300 select-text">{item.answer}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {items && !busy && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
          <Button size="sm" variant="ghost" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={build}>{t('New pack')}</Button>
          <div className="flex gap-2">
            {onPractise && (
              <Button size="sm" icon={<Mic className="w-3.5 h-3.5" />} onClick={() => onPractise((picked.length ? picked : items).map(item => item.question))}>
                {t('Practise {n}', { n: picked.length || items.length })}
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={!picked.length} onClick={add}>{t('Add {n} to my answers', { n: picked.length || '' })}</Button>
          </div>
        </div>
      )}
    </div>
  );
};
