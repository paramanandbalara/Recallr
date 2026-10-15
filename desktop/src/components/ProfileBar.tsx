import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Profile } from '../services/storage';
import { t } from '../i18n';
import { IconButton } from './ui';

interface Props {
  profiles: Profile[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

const fieldClass = 'min-w-0 flex-1 bg-slate-950/60 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500';

// Pick, add, rename or delete the profile being edited (and used for answers)
export const ProfileBar: React.FC<Props> = ({ profiles, activeId, onSwitch, onCreate, onRename, onDelete }) => {
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const active = profiles.find(p => p.id === activeId);

  const startEditing = (mode: 'new' | 'rename') => {
    setEditing(mode);
    setName(mode === 'rename' ? active?.name ?? '' : '');
  };

  const submit = () => {
    if (!name.trim()) return;
    if (editing === 'new') onCreate(name);
    else onRename(name);
    setEditing(null);
  };

  return (
    <div className="px-3 py-2 border-b border-slate-800 shrink-0">
      {editing ? (
        <form className="flex items-center gap-1" onSubmit={e => { e.preventDefault(); submit(); }}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setEditing(null)}
            placeholder={editing === 'new' ? t('e.g. Shopify – Tech Lead') : t('Profile name')}
            className={fieldClass}
          />
          <IconButton type="submit" title={t('Save name')} disabled={!name.trim()}><Check className="w-3.5 h-3.5" /></IconButton>
          <IconButton type="button" title={t('Cancel')} onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></IconButton>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-slate-400 mr-1">{t('Profile')}</span>
          <select value={activeId} onChange={e => onSwitch(e.target.value)} className={fieldClass}>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <IconButton title={t('New profile')} onClick={() => startEditing('new')}><Plus className="w-3.5 h-3.5" /></IconButton>
          <IconButton title={t('Rename profile')} onClick={() => startEditing('rename')}><Pencil className="w-3.5 h-3.5" /></IconButton>
          <IconButton
            tone="danger"
            title={profiles.length > 1 ? t('Delete profile') : t("The only profile can't be deleted")}
            disabled={profiles.length <= 1}
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      )}
      <p className="mt-1 text-[10px] text-slate-500">
        {editing === 'new'
          ? t('Starts with your current resume and prepared answers; add the job details after.')
          : t('Each profile has its own resume, job, company notes and answers. Switching saves your changes.')}
      </p>
    </div>
  );
};
