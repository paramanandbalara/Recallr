import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, MessageSquareQuote, X } from 'lucide-react';
import { SITE } from '../api';
import { useAuth } from '../auth';
import { AnnouncementBar } from './AnnouncementBar';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white'}`;

const PUBLIC_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/guide', label: 'How to use' },
  { to: '/download', label: 'Download' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [menuPath, setMenuPath] = useState(pathname);
  // Close the phone menu after moving to another page
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  const links = (
    <>
      {PUBLIC_LINKS.map(link => <NavLink key={link.to} to={link.to} className={navClass}>{link.label}</NavLink>)}
      {user ? (
        <>
          {user.role === 'ADMIN' && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
          <NavLink to="/account" end={false} className={navClass}>Account</NavLink>
          <button onClick={signOut} className="rounded-lg px-3 py-1.5 text-left text-sm text-slate-400 hover:text-white">Sign out</button>
        </>
      ) : (
        <>
          <NavLink to="/login" className={navClass}>Sign in</NavLink>
          <Link to="/register" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">Start free trial</Link>
        </>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <MessageSquareQuote className="h-5 w-5 text-blue-400" /> Recallr
          </Link>
          <nav className="hidden items-center gap-1 md:flex">{links}</nav>
          <button className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && <nav className="flex flex-col gap-1 border-t border-slate-800 px-4 py-3 md:hidden">{links}</nav>}
      </header>

      <AnnouncementBar />
      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-800 py-10 text-sm text-slate-500">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-semibold text-slate-300">
              <MessageSquareQuote className="h-4 w-4 text-blue-400" /> Recallr
            </div>
            <p className="mt-2 text-xs leading-relaxed">Your AI interview assistant, from preparation to the last question.</p>
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <Link to="/pricing" className="hover:text-slate-300">Pricing</Link>
            <Link to="/guide" className="hover:text-slate-300">How to use</Link>
            <Link to="/download" className="hover:text-slate-300">Download</Link>
            <Link to="/contact" className="hover:text-slate-300">Contact</Link>
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <Link to="/terms" className="hover:text-slate-300">Terms of service</Link>
            <Link to="/privacy" className="hover:text-slate-300">Privacy policy</Link>
            <Link to="/refunds" className="hover:text-slate-300">Refund policy</Link>
          </div>
        </div>
        <p className="mt-8 text-center text-xs">© {new Date().getFullYear()} {SITE.businessName}. All rights reserved.</p>
      </footer>
    </div>
  );
};
