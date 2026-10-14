import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, BookOpen, CreditCard, GraduationCap, History, LayoutDashboard, LifeBuoy, Megaphone, Package, Settings, Ticket, Users } from 'lucide-react';

const LINKS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy },
  { to: '/admin/plans', label: 'Plans', icon: Package },
  { to: '/admin/coupons', label: 'Coupons', icon: Ticket },
  { to: '/admin/questions', label: 'Question bank', icon: BookOpen },
  { to: '/admin/organizations', label: 'Colleges', icon: GraduationCap },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/activity', label: 'Activity', icon: History },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`;

export const AdminLayout: React.FC = () => (
  <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[200px_1fr]">
    <aside>
      <div className="mb-3 hidden px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:block">Admin</div>
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass}><Icon className="h-4 w-4" /> {label}</NavLink>
        ))}
      </nav>
    </aside>
    <section className="min-w-0"><Outlet /></section>
  </div>
);

export const AdminTitle: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-2xl font-bold text-white">{title}</h1>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);
