import React, { useRef, useState } from 'react';
import { Plus, Upload, ClipboardPaste, ListPlus, Trash2, Sparkles, ChevronDown, ChevronRight, AlertCircle, BookOpen, Briefcase, BookMarked } from 'lucide-react';
import { ACCEPTED_FILES, extractTextFromFile } from '../services/fileText';
import { answersFromJobDescription, draftPreparedAnswer, storiesFromResume, structurePreparedAnswers } from '../services/ai';
import { describeAiError } from '../services/llm';
import { newId, type PreparedAnswer, type Settings } from '../services/storage';
import { Button, IconButton, TextArea, TextInput } from './ui';

const COMMON_QUESTIONS = [
  'Tell me about yourself',
  'Why are you looking for a change?',
  'Why do you want to join our company?',
  'What are your greatest strengths?',
  'What is your biggest weakness?',
  'Tell me about a challenging project and how you handled it',
  'Tell me about a time you had a conflict with a teammate',
  'Describe a mistake you made and what you learned',
  'Where do you see yourself in five years?',
  'What are your salary expectations?',
  'Do you have any questions for us?',
];

interface Props {
  answers: PreparedAnswer[];
  onChange: (answers: PreparedAnswer[]) => void;
  // Resume, job and API key are used to split imports and draft answers
  settings: Settings;
}

export const AnswerBankEditor: React.FC<Props> = ({ answers, onChange, settings }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [importing, setImporting] = useState(false);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<'job' | 'stories' | null>(null);
  const [error, setError] = useState('');

  const update = (id: string, patch: Partial<PreparedAnswer>) =>
    onChange(answers.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const remove = (id: string) => onChange(answers.filter(a => a.id !== id));

  const addBlank = () => {
    const item = { id: newId(), question: '', answer: '' };
    onChange([...answers, item]);
    setOpenId(item.id);
  };

  const addCommon = () => {
    const existing = new Set(answers.map(a => a.question.trim().toLowerCase()));
    const fresh = COMMON_QUESTIONS
      .filter(q => !existing.has(q.toLowerCase()))
      .map(question => ({ id: newId(), question, answer: '' }));
    onChange([...answers, ...fresh]);
  };

  // Add AI-written questions and answers, skipping questions that are already in the list
  const generate = async (kind: 'job' | 'stories') => {
    setError('');
    setGenerating(kind);
    try {
      const items = await (kind === 'job' ? answersFromJobDescription(settings) : storiesFromResume(settings));
      const existing = new Set(answers.map(a => a.question.trim().toLowerCase()));
      const fresh = items.filter(item => !existing.has(item.question.trim().toLowerCase()));
      if (fresh.length === 0) setError('Nothing new to add: those questions are already in your list.');
      onChange([...answers, ...fresh]);
    } catch (err) {
      setError(`Could not write them. ${describeAiError(err)}`);
    } finally {
      setGenerating(null);
    }
  };

  const importText = async (text: string) => {
    setError('');
    setImporting(true);
    try {
      const items = await structurePreparedAnswers(text);
      onChange([...answers, ...items]);
      setPasteText('');
      setPasteOpen(false);
    } finally {
      setImporting(false);
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      setImporting(true);
      await importText(await extractTextFromFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
      setImporting(false);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const draft = async (item: PreparedAnswer) => {
    setError('');
    setDraftingId(item.id);
    try {
      update(item.id, { answer: await draftPreparedAnswer(item.question, settings) });
    } catch (err) {
      setError(`Could not draft an answer. ${describeAiError(err)}`);
    } finally {
      setDraftingId(null);
    }
  };

  const filled = answers.filter(a => a.answer.trim()).length;

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept={ACCEPTED_FILES} className="hidden" onChange={e => importFile(e.target.files?.[0])} />

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileRef.current?.click()} loading={importing}>
          Import file
        </Button>
        <Button size="sm" icon={<ClipboardPaste className="w-3.5 h-3.5" />} onClick={() => setPasteOpen(v => !v)} disabled={importing}>
          Paste text
        </Button>
        <Button size="sm" icon={<ListPlus className="w-3.5 h-3.5" />} onClick={addCommon}>
          Common questions
        </Button>
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={addBlank}>
          Add question
        </Button>
        <Button
          size="sm"
          icon={<Briefcase className="w-3.5 h-3.5" />}
          onClick={() => generate('job')}
          loading={generating === 'job'}
          disabled={!settings.job.trim() || !!generating}
          title={settings.job.trim() ? 'Likely questions for this job, with answers drafted from your resume' : 'Add the job description in the Profile tab first'}
        >
          From job description
        </Button>
        <Button
          size="sm"
          icon={<BookMarked className="w-3.5 h-3.5" />}
          onClick={() => generate('stories')}
          loading={generating === 'stories'}
          disabled={!settings.cv.trim() || !!generating}
          title={settings.cv.trim() ? 'Real stories from your resume for behavioural questions' : 'Add your resume in the Profile tab first'}
        >
          Stories from resume
        </Button>
      </div>

      {pasteOpen && (
        <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
          <TextArea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={'Tell me about yourself\nKeep it to 60–90 seconds...\nI\'m a backend-focused Technical Lead with...\n\nWhy do you want to leave?\n...'}
            className="h-36 text-xs"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              AI will split this into separate questions, keeping your wording.
            </span>
            <Button size="sm" variant="primary" onClick={() => importText(pasteText)} loading={importing} disabled={!pasteText.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}

      {importing && <div className="text-[11px] text-blue-300 animate-pulse">Reading and organizing your answers...</div>}
      {generating && (
        <div className="text-[11px] text-blue-300 animate-pulse">
          {generating === 'job' ? 'Working out the likely questions and drafting answers...' : 'Finding stories in your resume...'} This can take up to a minute.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
        </div>
      )}

      {answers.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center">
          <BookOpen className="w-5 h-5 text-slate-500" />
          <div className="text-sm text-slate-300">No prepared answers yet</div>
          <div className="text-[11px] text-slate-500 max-w-[260px]">
            When the interviewer asks one of these questions, your own answer shows up instantly.
          </div>
        </div>
      ) : (
        <>
          <div className="text-[11px] text-slate-500">{answers.length} questions · {filled} answered</div>
          <ul className="space-y-1.5">
            {answers.map(item => {
              const isOpen = openId === item.id;
              return (
                <li key={item.id} className="rounded-lg border border-slate-700 bg-slate-800/60">
                  <div className="flex items-center gap-1 pr-1">
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      className="flex flex-1 min-w-0 items-center gap-2 px-2.5 py-2 text-left"
                    >
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.answer.trim() ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="text-xs text-slate-200 truncate">{item.question || 'Untitled question'}</span>
                    </button>
                    <IconButton title="Delete" onClick={() => remove(item.id)} className="hover:!bg-red-500/10 hover:!text-red-300">
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>

                  {isOpen && (
                    <div className="space-y-2 border-t border-slate-700 p-2.5">
                      <TextInput
                        value={item.question}
                        onChange={e => update(item.id, { question: e.target.value })}
                        placeholder="Question, e.g. Tell me about yourself"
                        className="text-xs"
                        autoFocus={!item.question}
                      />
                      <TextInput
                        value={item.notes || ''}
                        onChange={e => update(item.id, { notes: e.target.value })}
                        placeholder="Tip for yourself (optional), e.g. Keep it to 60–90 seconds"
                        className="text-xs"
                      />
                      <TextArea
                        value={item.answer}
                        onChange={e => update(item.id, { answer: e.target.value })}
                        placeholder="Your prepared answer. Use [company name] and it will be filled in automatically."
                        className="h-40 text-xs"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Sparkles className="w-3.5 h-3.5" />}
                          onClick={() => draft(item)}
                          loading={draftingId === item.id}
                          disabled={!item.question.trim()}
                          title="Draft an answer from your resume"
                        >
                          {item.answer.trim() ? 'Redraft from resume' : 'Draft from resume'}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};
