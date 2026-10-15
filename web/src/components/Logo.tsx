import React from 'react';
import markUrl from '../assets/logo-mark.webp';

// The Recallr mark: the R with a brain on its left side. The full set (app icon, wordmarks) is in docs/brand.
export const LogoMark: React.FC<{ className?: string; title?: string }> = ({ className = 'h-6 w-6', title }) => (
  <img
    src={markUrl}
    className={`${className} object-contain select-none`}
    alt={title ?? ''}
    aria-hidden={title ? undefined : true}
    draggable={false}
  />
);
