import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400',
  secondary: 'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 disabled:opacity-50',
  ghost: 'text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40',
  danger: 'bg-red-600/90 text-white hover:bg-red-500 disabled:opacity-50',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' }> = ({
  variant = 'secondary', loading, size = 'md', className = '', children, disabled, ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${
      size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'} ${VARIANTS[variant]} ${className}`}
  >
    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    {children}
  </button>
);

const field = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...rest }, ref) => (
  <input ref={ref} {...rest} className={`${field} ${className}`} />
));

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...rest }) => (
  <select {...rest} className={`${field} ${className}`} />
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...rest }) => (
  <textarea {...rest} className={`${field} ${className}`} />
);

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-slate-300">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
  </label>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-5 ${className}`}>{children}</div>
);

export const ErrorText: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  children ? <p className="text-sm text-red-300">{children}</p> : null;

export const Badge: React.FC<{ tone?: 'green' | 'amber' | 'red' | 'blue' | 'slate'; children: React.ReactNode }> = ({ tone = 'slate', children }) => {
  const tones = {
    green: 'bg-emerald-500/15 text-emerald-300', amber: 'bg-amber-500/15 text-amber-300', red: 'bg-red-500/15 text-red-300',
    blue: 'bg-blue-500/15 text-blue-300', slate: 'bg-slate-700/50 text-slate-300',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
};
