import React, { useId } from 'react';

// The Recallr mark: a speech bubble with sound bars (it listens) and a spark (it answers).
// Same drawing as public/favicon.svg; the gradient ids are unique so several logos can share a page.
export const LogoMark: React.FC<{ className?: string; title?: string }> = ({ className = 'h-6 w-6', title }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 512 512" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="0.3" cy="0.18" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${id}-bg)`} />
      <rect width="512" height="512" rx="116" fill={`url(#${id}-shine)`} />
      <path d="M168 128h176a56 56 0 0 1 56 56v104a56 56 0 0 1-56 56H236l-70 54a8 8 0 0 1-13-6v-48a56 56 0 0 1-41-54V184a56 56 0 0 1 56-56z" fill="#fff" />
      <g fill="#6d28d9">
        <rect x="182" y="208" width="30" height="56" rx="15" />
        <rect x="226" y="180" width="30" height="112" rx="15" />
        <rect x="270" y="198" width="30" height="76" rx="15" />
        <rect x="314" y="214" width="30" height="44" rx="15" />
      </g>
      <path d="M392 72c6 30 18 42 48 48-30 6-42 18-48 48-6-30-18-42-48-48 30-6 42-18 48-48z" fill="#fde68a" />
    </svg>
  );
};
