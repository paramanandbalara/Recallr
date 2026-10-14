import React from 'react';
import { Check, AlertCircle, ExternalLink, Zap } from 'lucide-react';
import { PROVIDERS, type ProviderId } from '../services/llm';
import type { AnswerProvider, Settings } from '../services/storage';
import type { KeyTestResult } from '../hooks/useKeyTests';
import { Button, Label, TextInput } from './ui';

interface Props {
  settings: Settings;
  onChange: (changes: Partial<Settings>) => void;
  results: Record<ProviderId, KeyTestResult>;
  onTest: (provider: ProviderId, key: string) => void;
  onKeyEdited: (provider: ProviderId) => void;
}

const ROWS: { id: ProviderId; hint: string }[] = [
  { id: 'groq', hint: 'Fastest. Free key. Used first for speech-to-text and answers.' },
  { id: 'openai', hint: 'Backup if Groq fails, or use it on its own.' },
];

const CHOICES: { id: AnswerProvider; label: string }[] = [
  { id: 'auto', label: 'Auto (fastest)' },
  { id: 'groq', label: 'Groq' },
  { id: 'openai', label: 'OpenAI' },
];

export const ApiKeysForm: React.FC<Props> = ({ settings, onChange, results, onTest, onKeyEdited }) => (
  <div className="space-y-4">
    {ROWS.map(({ id, hint }) => {
      const provider = PROVIDERS[id];
      const key = settings[provider.keyField];
      const result = results[id];
      return (
        <div key={id}>
          <Label
            hint={
              <>
                {hint}{' '}
                <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5">
                  Get a key <ExternalLink className="w-3 h-3" />
                </a>
              </>
            }
          >
            {provider.label} API key
          </Label>
          <div className="flex gap-2">
            <TextInput
              type="password"
              value={key}
              onChange={e => { onChange({ [provider.keyField]: e.target.value }); onKeyEdited(id); }}
              placeholder={provider.keyHint}
            />
            <Button onClick={() => onTest(id, key)} loading={result.state === 'testing'} disabled={!key.trim()}>
              Test
            </Button>
          </div>
          {result.state === 'ok' && (
            <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1"><Check className="w-3 h-3" /> Key works</p>
          )}
          {result.state === 'error' && (
            <p className="text-[11px] text-red-300 mt-1.5 flex items-start gap-1"><AlertCircle className="w-3 h-3 shrink-0 mt-px" /> {result.message}</p>
          )}
        </div>
      );
    })}

    <div>
      <Label hint="Auto uses Groq first because it's the fastest, and switches to OpenAI if Groq fails.">
        <span className="inline-flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-400" /> Answers from</span>
      </Label>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950/60 border border-slate-700 p-1">
        {CHOICES.map(choice => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onChange({ answerProvider: choice.id })}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              settings.answerProvider === choice.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
