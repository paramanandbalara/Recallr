import React, { useState } from 'react';
import { ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-react';
import { findStories } from '../services/ai';
import { describeAiError } from '../services/llm';
import { newId, STORY_THEMES, type Settings, type Story, type StoryTheme } from '../services/storage';
import { Button, IconButton, TextArea, TextInput } from './ui';

interface Props {
  settings: Settings;
  onChange: (stories: Story[]) => void;
}

// The story bank: true stories from the user's work, each as situation, what they did and the result.
// Live answers to "Tell me about a time..." use the one that fits best.
export const StoryBankEditor: React.FC<Props> = ({ settings, onChange }) => {
  const stories = settings.stories;
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (id: string, patch: Partial<Story>) => onChange(stories.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const covered = new Set(stories.flatMap(s => s.themes));

  const find = async () => {
    setBusy(true);
    setError('');
    try {
      const found = await findStories(settings);
      const titles = new Set(stories.map(s => s.title.toLowerCase()));
      const fresh = found.filter(s => !titles.has(s.title.toLowerCase()));
      if (!fresh.length) setError('No new stories found. Add more detail to your resume or notes, or write one yourself.');
      onChange([...stories, ...fresh]);
    } catch (err) {
      setError(`Could not find stories. ${describeAiError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const story: Story = { id: newId(), title: '', situation: '', action: '', result: '', themes: [] };
    onChange([...stories, story]);
    setOpen(story.id);
  };

  const toggleTheme = (story: Story, theme: StoryTheme) =>
    update(story.id, { themes: story.themes.includes(theme) ? story.themes.filter(t => t !== theme) : [...story.themes, theme] });

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-slate-400">
        Your true stories, ready for “Tell me about a time…” questions. When one comes up, Recallr builds the answer on the story that fits best.
      </p>

      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Questions your stories cover</div>
        <div className="flex flex-wrap gap-1">
          {STORY_THEMES.map(theme => (
            <span key={theme} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${covered.has(theme) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
              {covered.has(theme) ? '✓ ' : ''}{theme}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="primary" icon={<Sparkles className="w-3.5 h-3.5" />} onClick={find} loading={busy} disabled={!settings.cv.trim()}
          title={settings.cv.trim() ? 'Find stories in your resume and notes' : 'Add your resume in the Profile tab first'}>
          Find in my resume
        </Button>
        <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={add}>Write one</Button>
      </div>
      {busy && <p className="text-[11px] text-blue-300 animate-pulse">Reading your resume and notes for stories... This can take a little while.</p>}
      {error && <p className="text-[11px] text-red-300">{error}</p>}

      <ul className="space-y-1.5">
        {stories.map(story => (
          <li key={story.id} className="list-in rounded-lg border border-slate-800">
            <button onClick={() => setOpen(open === story.id ? null : story.id)} className="flex w-full items-start gap-2 p-2.5 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-slate-100">{story.title || 'Untitled story'}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-500">{story.themes.join(' · ') || story.situation || 'Add the details'}</span>
              </span>
              <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open === story.id ? 'rotate-180' : ''}`} />
            </button>
            {open === story.id && (
              <div className="space-y-2 border-t border-slate-800 p-2.5">
                <TextInput value={story.title} onChange={e => update(story.id, { title: e.target.value })} placeholder="Name it, e.g. Checkout latency fix" className="text-xs" />
                <TextArea value={story.situation} onChange={e => update(story.id, { situation: e.target.value })} placeholder="Situation: the context and the problem" className="h-14 text-xs" />
                <TextArea value={story.action} onChange={e => update(story.id, { action: e.target.value })} placeholder="What you did, step by step" className="h-20 text-xs" />
                <TextArea value={story.result} onChange={e => update(story.id, { result: e.target.value })} placeholder="The result, with numbers if you have them" className="h-12 text-xs" />
                <div className="flex flex-wrap gap-1">
                  {STORY_THEMES.map(theme => (
                    <button key={theme} onClick={() => toggleTheme(story, theme)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${story.themes.includes(theme) ? 'border-blue-500 bg-blue-500/10 text-slate-100' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                      {theme}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end">
                  <IconButton tone="danger" title="Delete this story" onClick={() => onChange(stories.filter(s => s.id !== story.id))}><Trash2 className="w-3.5 h-3.5" /></IconButton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {stories.length === 0 && !busy && <p className="py-4 text-center text-[11px] text-slate-500">No stories yet.</p>}
    </div>
  );
};
