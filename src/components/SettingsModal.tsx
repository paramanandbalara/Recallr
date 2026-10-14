import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { createProfile, deleteProfile, LANGUAGES, loadActiveProfile, loadProfiles, loadSettings, renameProfile, saveSettings, setActiveProfile, type AnswerLanguage, type Settings } from '../services/storage';
import { useKeyTests } from '../hooks/useKeyTests';
import { ApiKeysForm } from './ApiKeysForm';
import { ResumeInput } from './ResumeInput';
import { AnswerBankEditor } from './AnswerBankEditor';
import { ProfileBar } from './ProfileBar';
import { UsagePanel } from './UsagePanel';
import { KnowledgeEditor } from './KnowledgeEditor';
import { Button, IconButton, Label, Select, TextArea, TextInput } from './ui';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  conversationId: string; // For the usage of the current conversation
}

type Tab = 'profile' | 'answers' | 'api';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'answers', label: 'Answers' },
  { id: 'api', label: 'API keys' },
];

// Mounted only while open, so it always starts from the saved settings
export const SettingsModal: React.FC<Props> = ({ onClose, onSaved, conversationId }) => {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [tab, setTab] = useState<Tab>('profile');
  const keyTests = useKeyTests();
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [activeId, setActiveId] = useState(() => loadActiveProfile().id);

  // Profile changes save the current edits first, so nothing typed is lost
  const changeProfiles = (change: () => void) => {
    saveSettings(settings);
    change();
    setProfiles(loadProfiles());
    setActiveId(loadActiveProfile().id);
    setSettings(loadSettings());
    onSaved();
  };

  const removeProfile = () => {
    const name = profiles.find(p => p.id === activeId)?.name;
    if (!window.confirm(`Delete the profile "${name}" with its resume, job details and answers? This can't be undone.`)) return;
    changeProfiles(() => deleteProfile(activeId));
  };

  const patch = (changes: Partial<Settings>) => setSettings(prev => ({ ...prev, ...changes }));

  const handleSave = () => {
    saveSettings(settings);
    onSaved();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-slate-900">
      {/* Header */}
      <div className="drag-area flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
        <IconButton onClick={onClose} title="Close without saving">
          <X className="w-4 h-4" />
        </IconButton>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-2 border-b border-slate-800 shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-blue-500 text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.id === 'answers' && settings.answers.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-700 px-1.5 py-px text-[10px] text-slate-300">{settings.answers.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab !== 'api' && (
        <ProfileBar
          profiles={profiles}
          activeId={activeId}
          onSwitch={id => changeProfiles(() => setActiveProfile(id))}
          onCreate={name => changeProfiles(() => createProfile(name, loadActiveProfile()))}
          onRename={name => changeProfiles(() => renameProfile(activeId, name))}
          onDelete={removeProfile}
        />
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'profile' && (
          <>
            <div>
              <Label hint="Answers are built only from facts in your resume.">Resume</Label>
              <ResumeInput cv={settings.cv} fileName={settings.cvFileName} onChange={(cv, cvFileName) => patch({ cv, cvFileName })} />
            </div>
            <div>
              <Label hint='Fills "[company name]" in your prepared answers.'>Company name</Label>
              <TextInput value={settings.company} onChange={e => patch({ company: e.target.value })} placeholder="e.g. Shopify" />
            </div>
            <div>
              <Label hint="The job ad or the goal of the meeting.">Job description</Label>
              <TextArea
                value={settings.job}
                onChange={e => patch({ job: e.target.value })}
                placeholder="Job requirements, responsibilities, tech stack..."
                className="h-32 text-xs"
              />
            </div>
            <div>
              <Label hint='Your research on the company, so answers like "Why us?" mention real details.'>Company notes</Label>
              <TextArea
                value={settings.companyNotes}
                onChange={e => patch({ companyNotes: e.target.value })}
                placeholder="Products, mission and values, recent news, team, tech stack..."
                className="h-28 text-xs"
              />
            </div>
            <div>
              <Label hint="Who's interviewing, so answers fit who's asking (optional).">Interviewer</Label>
              <TextArea
                value={settings.interviewer}
                onChange={e => patch({ interviewer: e.target.value })}
                placeholder="e.g. Engineering manager, 10 yrs Java, second technical round"
                className="h-16 text-xs"
              />
            </div>
            <div>
              <Label hint="Project notes, docs, system design notes... Each question only uses the parts that fit it.">Your notes & documents</Label>
              <KnowledgeEditor files={settings.knowledge} onChange={knowledge => patch({ knowledge })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label hint="What the interviewer speaks.">Interview language</Label>
                <Select value={settings.language} onChange={e => patch({ language: e.target.value })} className="text-xs">
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </Select>
              </div>
              <div>
                <Label hint="Hindi answers come as Hinglish.">Answer in</Label>
                <Select
                  value={settings.answerLanguage}
                  onChange={e => patch({ answerLanguage: e.target.value as AnswerLanguage })}
                  disabled={settings.language === 'en'}
                  className="text-xs disabled:opacity-50"
                >
                  <option value="same">Same as the question</option>
                  <option value="english">Always English</option>
                </Select>
              </div>
            </div>
          </>
        )}

        {tab === 'answers' && (
          <AnswerBankEditor answers={settings.answers} onChange={answers => patch({ answers })} settings={settings} />
        )}

        {tab === 'api' && (
          <ApiKeysForm
            settings={settings}
            onChange={patch}
            results={keyTests.results}
            onTest={keyTests.test}
            onKeyEdited={keyTests.reset}
          />
        )}
        {tab === 'api' && <UsagePanel conversationId={conversationId} />}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={<Save className="w-4 h-4" />} onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
};
