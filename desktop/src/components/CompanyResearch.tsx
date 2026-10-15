import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { companyResearch } from '../services/account';
import { t } from '../i18n';
import { Button, TextInput } from './ui';

// "Get notes from the website": the server reads the company's site and writes short research notes
export const CompanyResearch: React.FC<{ notes: string; onNotes: (notes: string) => void }> = ({ notes, onNotes }) => {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async () => {
    if (notes.trim() && !window.confirm(t('Add the website notes below what you already wrote?'))) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await companyResearch(url);
      onNotes(notes.trim() ? `${notes.trim()}\n\n${result.notes}` : result.notes);
      setMessage(result.sources.length === 1
        ? t("Read 1 page. Check the notes and fix anything that's off.")
        : t("Read {n} pages. Check the notes and fix anything that's off.", { n: result.sources.length }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Could not read the website.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2 space-y-1">
      <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); if (url.trim()) run(); }}>
        <TextInput value={url} onChange={e => setUrl(e.target.value)} placeholder={t('Company website, e.g. northwind.com')} className="text-xs" />
        <Button type="submit" size="sm" icon={<Globe className="w-3.5 h-3.5" />} loading={busy} disabled={!url.trim()} className="shrink-0">
          {t('Get notes')}
        </Button>
      </form>
      {busy && <p className="text-[11px] text-blue-300 animate-pulse">{t('Reading the website… this takes a few seconds.')}</p>}
      {message && !busy && <p className="text-[11px] text-slate-400">{message}</p>}
    </div>
  );
};
