import React from 'react';
import { NavLink } from 'react-router-dom';

// The account pages, grouped: a sidebar on wide screens, scrolling tabs on phones
const GROUPS: { title: string; links: [string, string][] }[] = [
  { title: 'Practice', links: [['/account', 'Overview'], ['/account/daily', 'Daily practice'], ['/account/progress', 'Progress'], ['/account/questions', 'My questions'], ['/account/tools', 'Career tools']] },
  { title: 'Plan & billing', links: [['/account/buy', 'Buy a plan'], ['/account/billing', 'Billing'], ['/account/invite', 'Invite friends']] },
  { title: 'Account', links: [['/account/devices', 'Devices'], ['/account/organization', 'College'], ['/account/support', 'Support'], ['/account/settings', 'Settings']] },
];

const tab = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-3 py-2 text-sm ${isActive ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`;

const side = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-slate-800 font-medium text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`;

// Header, navigation and content of the account pages
export const AccountPage: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mx-auto max-w-6xl px-4 py-10">
    <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
      <aside className="hidden lg:block">
        <nav className="sticky top-20 space-y-5" aria-label="Account">
          {GROUPS.map(group => (
            <div key={group.title}>
              <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</div>
              <div className="mt-1.5 space-y-0.5">
                {group.links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/account'} className={side}>{label}</NavLink>)}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <nav aria-label="Account" className="relative mt-4 lg:hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-800 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none]">
            {GROUPS.flatMap(group => group.links).map(([to, label]) => <NavLink key={to} to={to} end={to === '/account'} className={tab}>{label}</NavLink>)}
          </div>
        </nav>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  </div>
);
