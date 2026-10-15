import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Check, FileText, BookOpen } from 'lucide-react';
import { LogoMark } from './Logo';
import { loadSettings, saveSettings, type Settings } from '../services/storage';
import { useAccount } from '../hooks/useAccount';
import { setUiLanguage, t, uiLanguage, UI_LANGUAGES } from '../i18n';
import { ResumeInput } from './ResumeInput';
import { AnswerBankEditor } from './AnswerBankEditor';
import { Button, Label, TextArea, TextInput } from './ui';

interface Props {
  onComplete: () => void;
}

const steps = () => [
  { title: t('Resume & job'), icon: FileText },
  { title: t('Answers'), icon: BookOpen },
];

// App language, so a Hindi speaker can switch before going further
const LanguageToggle: React.FC = () => (
  <div className="flex rounded-md border border-slate-700 p-0.5">
    {UI_LANGUAGES.map(l => (
      <button
        key={l.id}
        type="button"
        onClick={() => setUiLanguage(l.id)}
        className={`rounded px-2 py-0.5 text-[11px] font-medium ${uiLanguage() === l.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
      >
        {l.label}
      </button>
    ))}
  </div>
);

export const OnboardingScreen: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const { user, allowance } = useAccount();
  const stepList = steps();

  const patch = (changes: Partial<Settings>) => setSettings(prev => ({ ...prev, ...changes }));

  const isLast = step === stepList.length - 1;

  const finish = () => {
    saveSettings(settings);
    onComplete();
  };

  return (
    <div className="flex flex-col h-screen w-full select-none">
      {/* Header (draggable) */}
      <div className="drag-area flex items-center gap-2.5 px-4 py-3 border-b border-slate-800 bg-slate-900/80 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
          <LogoMark className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-100 leading-tight">Recallr</h1>
          <p className="text-[11px] text-slate-500 leading-tight">{t('Setup · step {step} of {total}', { step: step + 1, total: stepList.length })}</p>
        </div>
        <div className="ml-auto">
          <LanguageToggle />
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1.5 px-4 pt-3 shrink-0">
        {stepList.map((s, i) => (
          <div key={s.title} className="flex-1">
            <div className={`h-1 rounded-full transition-colors ${i <= step ? 'bg-blue-500' : 'bg-slate-700'}`} />
            <div className={`mt-1.5 flex items-center gap-1 text-[10px] ${i === step ? 'text-slate-200' : 'text-slate-500'}`}>
              <s.icon className="w-3 h-3" /> {s.title}
            </div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">{t('Welcome, {name}', { name: user.name.split(' ')[0] })}</h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {t('Recallr listens to the conversation and suggests answers based on your resume and the answers you prepared.')}
                {allowance.onTrial && ` ${t('Your free trial is active: try it with a "Mock interview" first (in the main window after setup).')}`}
              </p>
            </div>
            <div>
              <Label hint={t('Answers are built only from facts in your resume.')}>{t('Your resume')}</Label>
              <ResumeInput
                cv={settings.cv}
                fileName={settings.cvFileName}
                onChange={(cv, cvFileName) => patch({ cv, cvFileName })}
              />
            </div>
            <div>
              <Label hint={t('Fills "[company name]" in your prepared answers.')}>{t('Company name')}</Label>
              <TextInput value={settings.company} onChange={e => patch({ company: e.target.value })} placeholder={t('e.g. Shopify')} />
            </div>
            <div>
              <Label>{t('Job description')}</Label>
              <TextArea
                value={settings.job}
                onChange={e => patch({ job: e.target.value })}
                placeholder={t('Paste the job description here...')}
                className="h-28 text-xs"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Label hint={t("Add the answers you've prepared, like “Tell me about yourself”. Optional, you can do this later in Settings.")}>
              {t('Prepared answers')}
            </Label>
            <AnswerBankEditor answers={settings.answers} onChange={answers => patch({ answers })} settings={settings} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 bg-slate-900/80 shrink-0">
        {step > 0 ? (
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => setStep(step - 1)}>{t('Back')}</Button>
        ) : <span />}

        <div className="flex items-center gap-2">
          {step === 0 && !settings.cv && (
            <Button variant="ghost" onClick={() => setStep(step + 1)}>{t('Skip')}</Button>
          )}
          {isLast ? (
            <Button variant="primary" icon={<Check className="w-4 h-4" />} onClick={finish}>{t('Finish setup')}</Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              {t('Next')} <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
