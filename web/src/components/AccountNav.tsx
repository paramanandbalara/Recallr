import React from 'react';
import { NavLink } from 'react-router-dom';

const tab = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-3 py-2 text-sm ${isActive ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`;

// Header and tabs of the account pages
export const AccountPage: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mx-auto max-w-5xl px-4 py-10">
    <h1 className="text-2xl font-bold text-white">{title}</h1>
    <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-800">
      <NavLink to="/account" end className={tab}>Overview</NavLink>
      <NavLink to="/account/questions" className={tab}>My questions</NavLink>
      <NavLink to="/account/progress" className={tab}>Progress</NavLink>
      <NavLink to="/account/daily" className={tab}>Daily practice</NavLink>
      <NavLink to="/account/tools" className={tab}>Career tools</NavLink>
      <NavLink to="/account/buy" className={tab}>Buy a plan</NavLink>
      <NavLink to="/account/billing" className={tab}>Billing</NavLink>
      <NavLink to="/account/devices" className={tab}>Devices</NavLink>
      <NavLink to="/account/invite" className={tab}>Invite friends</NavLink>
      <NavLink to="/account/organization" className={tab}>College</NavLink>
      <NavLink to="/account/support" className={tab}>Support</NavLink>
      <NavLink to="/account/settings" className={tab}>Settings</NavLink>
    </nav>
    <div className="mt-6">{children}</div>
  </div>
);
