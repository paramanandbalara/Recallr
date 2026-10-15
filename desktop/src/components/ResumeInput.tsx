import React, { useRef, useState } from 'react';
import { FileText, Upload, X, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { ACCEPTED_FILES, extractTextFromFile } from '../services/fileText';
import { queueResumeFile } from '../services/profileSync';
import { t } from '../i18n';
import { Button, IconButton, TextArea } from './ui';

interface Props {
  cv: string;
  fileName: string;
  onChange: (cv: string, fileName: string) => void;
}

export const ResumeInput: React.FC<Props> = ({ cv, fileName, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState('');
  const [showText, setShowText] = useState(!fileName && !!cv);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setIsReading(true);
    try {
      const text = await extractTextFromFile(file);
      onChange(text, file.name);
      queueResumeFile(file); // The original file goes to the account in the background, if that's on
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not read this file.'));
    } finally {
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const wordCount = cv.trim() ? cv.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILES}
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {cv ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
          <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-200 truncate">{fileName || t('Pasted resume')}</div>
            <div className="text-[11px] text-slate-500">{t('{n} words loaded', { n: wordCount.toLocaleString() })}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()} loading={isReading}>
            {t('Replace')}
          </Button>
          <IconButton title={t('Remove resume')} onClick={() => { onChange('', ''); setShowText(false); }}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
          disabled={isReading}
          className={`w-full flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-5 transition-colors ${
            isDragging ? 'border-blue-400 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'
          }`}
        >
          <Upload className={`w-5 h-5 ${isReading ? 'text-blue-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="text-sm text-slate-200">{isReading ? t('Reading file...') : t('Upload your resume')}</span>
          <span className="text-[11px] text-slate-500">{t('PDF, TXT or Markdown · drag & drop or click')}</span>
        </button>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowText(v => !v)}
        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
      >
        {showText ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {cv ? t('Review / edit extracted text') : t('Or paste your resume as text')}
      </button>

      {showText && (
        <TextArea
          value={cv}
          onChange={e => onChange(e.target.value, fileName)}
          placeholder={t('Paste your resume here...')}
          className="h-40 text-xs"
        />
      )}
    </div>
  );
};
