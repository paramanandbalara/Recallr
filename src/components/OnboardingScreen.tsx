import React, { useState } from 'react';
import { MessageSquareQuote, ArrowRight, ArrowLeft, Check, KeyRound, FileText, BookOpen } from 'lucide-react';
import { hasAnyKey, loadSettings, saveSettings, type Settings } from '../services/storage';
import { useKeyTests } from '../hooks/useKeyTests';
import { ApiKeysForm } from './ApiKeysForm';
import { ResumeInput } from './ResumeInput';
import { AnswerBankEditor } from './AnswerBankEditor';
import { Button, Label, TextArea, TextInput } from './ui';

interface Props {
  onComplete: () => void;
}

const STEPS = [
  { title: 'API keys', icon: KeyRound },
  { title: 'Resume & job', icon: FileText },
  { title: 'Answers', icon: BookOpen },
];

export const OnboardingScreen: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const [checkingKey, setCheckingKey] = useState(false);
  const keyTests = useKeyTests();

  const patch = (changes: Partial<Settings>) => setSettings(prev => ({ ...prev, ...changes }));

  // Verify the keys before moving past the first step; at least one must work
  const next = async () => {
    if (step === 0) {
      setCheckingKey(true);
      const ok = await keyTests.testAll(settings);
      setCheckingKey(false);
      if (!ok) return;
    }
    setStep(step + 1);
  };

  const keyReady = hasAnyKey(settings);
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    saveSettings(settings);
    onComplete();
  };

  return (
    <div className="flex flex-col h-screen w-full select-none">
      {/* Header (draggable) */}
      <div className="drag-area flex items-center gap-2.5 px-4 py-3 border-b border-slate-800 bg-slate-900/80 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
          <MessageSquareQuote className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-100 leading-tight">Recallr</h1>
          <p className="text-[11px] text-slate-500 leading-tight">Setup · step {step + 1} of {STEPS.length}</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1.5 px-4 pt-3 shrink-0">
        {STEPS.map((s, i) => (
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
              <h2 className="text-lg font-semibold text-slate-50">Welcome</h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Recallr listens to the conversation and suggests answers based on your resume and the answers you prepared.
              </p>
            </div>
            <ApiKeysForm
              settings={settings}
              onChange={patch}
              results={keyTests.results}
              onTest={keyTests.test}
              onKeyEdited={keyTests.reset}
            />
            <p className="text-[11px] text-slate-500">Add at least one key. Groq or OpenAI is needed for listening (speech-to-text).</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label hint="Answers are built only from facts in your resume.">Your resume</Label>
              <ResumeInput
                cv={settings.cv}
                fileName={settings.cvFileName}
                onChange={(cv, cvFileName) => patch({ cv, cvFileName })}
              />
            </div>
            <div>
              <Label hint='Fills "[company name]" in your prepared answers.'>Company name</Label>
              <TextInput value={settings.company} onChange={e => patch({ company: e.target.value })} placeholder="e.g. Shopify" />
            </div>
            <div>
              <Label>Job description</Label>
              <TextArea
                value={settings.job}
                onChange={e => patch({ job: e.target.value })}
                placeholder="Paste the job description here..."
                className="h-28 text-xs"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label hint="Add the answers you've prepared, like “Tell me about yourself”. Optional, you can do this later in Settings.">
              Prepared answers
            </Label>
            <AnswerBankEditor answers={settings.answers} onChange={answers => patch({ answers })} settings={settings} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800 bg-slate-900/80 shrink-0">
        {step > 0 ? (
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => setStep(step - 1)}>Back</Button>
        ) : <span />}

        <div className="flex items-center gap-2">
          {step === 1 && !settings.cv && (
            <Button variant="ghost" onClick={() => setStep(step + 1)}>Skip</Button>
          )}
          {isLast ? (
            <Button variant="primary" icon={<Check className="w-4 h-4" />} onClick={finish}>Finish setup</Button>
          ) : (
            <Button variant="primary" onClick={next} disabled={step === 0 && !keyReady} loading={checkingKey}>
              {checkingKey ? 'Checking keys...' : 'Next'} {!checkingKey && <ArrowRight className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
