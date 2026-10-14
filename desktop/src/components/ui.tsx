import React from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500',
  secondary: 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 disabled:opacity-50',
  ghost: 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-40',
  danger: 'text-slate-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary', size = 'md', loading, icon, children, className = '', disabled, ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed
      ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'} ${VARIANTS[variant]} ${className}`}
  >
    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    {children}
  </button>
);

export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'danger' }> = ({
  tone = 'default', className = '', ...rest
}) => (
  <button
    {...rest}
    className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
      tone === 'danger' ? 'text-slate-400 hover:bg-red-500 hover:text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
    } ${className}`}
  />
);

export const Label: React.FC<{ children: React.ReactNode; hint?: React.ReactNode }> = ({ children, hint }) => (
  <div className="mb-1.5">
    <div className="text-xs font-semibold text-slate-300">{children}</div>
    {hint && <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{hint}</div>}
  </div>
);

const fieldClass = 'w-full bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors';

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...rest }) => (
  <input {...rest} className={`${fieldClass} ${className}`} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', ...rest }) => (
  <select {...rest} className={`${fieldClass} ${className}`} />
);

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...rest }) => (
  <textarea {...rest} className={`${fieldClass} resize-none leading-relaxed ${className}`} />
);
