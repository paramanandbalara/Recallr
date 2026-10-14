import React, { useRef, useState } from 'react';
import { FileText, Upload, ClipboardPaste, Trash2, AlertCircle } from 'lucide-react';
import { ACCEPTED_FILES, extractTextFromFile } from '../services/fileText';
import { MAX_FILE_CHARS, type KnowledgeFile } from '../services/knowledge';
import { newId } from '../services/storage';
import { Button, IconButton, TextArea, TextInput } from './ui';

interface Props {
  files: KnowledgeFile[];
  onChange: (files: KnowledgeFile[]) => void;
}

const wordCount = (text: string) => (text.match(/\S+/g) ?? []).length;

// The user's own notes and documents for this profile
export const KnowledgeEditor: React.FC<Props> = ({ files, onChange }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const add = (name: string, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    if (clean.length > MAX_FILE_CHARS) setError(`"${name}" is long, so only the first ${MAX_FILE_CHARS.toLocaleString()} characters are kept.`);
    onChange([...files, { id: newId(), name: name.trim() || 'Notes', text: clean.slice(0, MAX_FILE_CHARS) }]);
  };

  const addFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setReading(true);
    try {
      add(file.name, await extractTextFromFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept={ACCEPTED_FILES} className="hidden" onChange={e => addFile(e.target.files?.[0])} />
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map(file => (
            <li key={file.id} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5">
              <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{file.name}</span>
              <span className="shrink-0 text-[10px] text-slate-500">{wordCount(file.text).toLocaleString()} words</span>
              <IconButton title="Remove" onClick={() => onChange(files.filter(f => f.id !== file.id))} className="hover:!bg-red-500/10 hover:!text-red-300">
                <Trash2 className="w-3.5 h-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileRef.current?.click()} loading={reading}>Add file</Button>
        <Button size="sm" icon={<ClipboardPaste className="w-3.5 h-3.5" />} onClick={() => setPasteOpen(v => !v)}>Paste notes</Button>
      </div>
      {pasteOpen && (
        <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
          <TextInput value={pasteName} onChange={e => setPasteName(e.target.value)} placeholder="Name, e.g. Payments project notes" className="text-xs" />
          <TextArea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Your notes..." className="h-28 text-xs" />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="primary"
              disabled={!pasteText.trim()}
              onClick={() => {
                add(pasteName, pasteText);
                setPasteName('');
                setPasteText('');
                setPasteOpen(false);
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
        </div>
      )}
    </div>
  );
};
