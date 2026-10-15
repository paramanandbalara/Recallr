import React, { useEffect, useState } from 'react';
import { CalendarClock, ListChecks, Plus, Trash2 } from 'lucide-react';
import { CALENDAR_EVENT, fromLocalInput, loadInterviews, saveInterviews, toLocalInput, upcoming, whenLabel, type Interview } from '../services/calendar';
import { newId, type Profile } from '../services/storage';
import { t } from '../i18n';
import { Button, IconButton, Label, Select, TextArea, TextInput } from './ui';

interface Props {
  profiles: Profile[];
  activeId: string;
  onPrep: (interview: Interview) => void; // Switch to its profile and open the prep pack
}

// Tomorrow at 10:00, as a starting point for a new interview
const defaultStart = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.getTime());
};

// Upcoming interviews. The day before each one the app offers a prep pack, and shortly before it starts
// it switches to the interview's profile.
export const InterviewCalendar: React.FC<Props> = ({ profiles, activeId, onPrep }) => {
  const [list, setList] = useState(loadInterviews);
  const [adding, setAdding] = useState(false);
  const active = profiles.find(p => p.id === activeId);
  const [draft, setDraft] = useState({ title: '', when: defaultStart(), profileId: activeId, notes: '' });
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const reload = () => {
      setList(loadInterviews());
      setNow(Date.now());
    };
    window.addEventListener(CALENDAR_EVENT, reload);
    return () => window.removeEventListener(CALENDAR_EVENT, reload);
  }, []);

  const startAdding = () => {
    setDraft({ title: active?.company || '', when: defaultStart(), profileId: activeId, notes: '' });
    setError('');
    setAdding(true);
  };

  const add = () => {
    const startsAt = fromLocalInput(draft.when);
    if (!draft.title.trim()) return setError(t('Add a name, e.g. the company and the round.'));
    if (!startsAt) return setError(t('Pick the date and time.'));
    if (startsAt < Date.now() - 60 * 60 * 1000) return setError(t('That time has already passed.'));
    const interview: Interview = { id: newId(), title: draft.title.trim(), startsAt, profileId: draft.profileId, notes: draft.notes.trim() };
    saveInterviews([...loadInterviews(), interview]);
    setAdding(false);
  };

  const remove = (id: string) => saveInterviews(loadInterviews().filter(i => i.id !== id));

  const items = upcoming(list, now);
  const profileName = (id: string) => profiles.find(p => p.id === id)?.name;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-slate-400">
        {t('Add your interviews. The day before, Recallr offers a prep pack for the job. Shortly before it starts, it switches to the right profile for you.')}
      </p>

      {items.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center">
          <CalendarClock className="mx-auto mb-2 h-5 w-5 text-slate-500" />
          <p className="text-xs text-slate-400">{t('No interviews coming up.')}</p>
        </div>
      )}

      {items.map(item => {
        const started = item.startsAt <= now;
        return (
          <div key={item.id} className="rounded-lg border border-slate-700/80 bg-slate-800/40 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-slate-100">{item.title}</div>
                <div className={`mt-0.5 text-[11px] ${started ? 'text-slate-500' : 'text-blue-300'}`}>
                  {whenLabel(item.startsAt, now)}
                  {profileName(item.profileId)
                    ? <span className="text-slate-500"> · {t('Profile')}: {profileName(item.profileId)}</span>
                    : <span className="text-amber-400"> · {t('Profile deleted')}</span>}
                </div>
                {item.notes && <p className="mt-1 whitespace-pre-line text-[11px] text-slate-400">{item.notes}</p>}
              </div>
              <IconButton tone="danger" onClick={() => remove(item.id)} title={t('Remove')}><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </div>
            {!started && (
              <div className="mt-2">
                <Button size="sm" variant="secondary" icon={<ListChecks className="h-3.5 w-3.5" />} onClick={() => onPrep(item)}>
                  {t('Prep pack')}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className="space-y-2.5 rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div>
            <Label>{t('Interview')}</Label>
            <TextInput autoFocus value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={t('e.g. Northwind, system design round')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t('Date and time')}</Label>
              <TextInput type="datetime-local" value={draft.when} onChange={e => setDraft({ ...draft, when: e.target.value })} className="text-xs [color-scheme:dark]" />
            </div>
            <div>
              <Label>{t('Profile')}</Label>
              <Select value={draft.profileId} onChange={e => setDraft({ ...draft, profileId: e.target.value })} className="text-xs">
                {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>{t('Notes (optional)')}</Label>
            <TextArea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder={t('Meeting link, who you’ll meet, what to bring...')} className="h-14 text-xs" />
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>{t('Cancel')}</Button>
            <Button size="sm" variant="primary" onClick={add}>{t('Add interview')}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={startAdding}>{t('Add interview')}</Button>
      )}
    </div>
  );
};
