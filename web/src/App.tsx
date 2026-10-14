import React, { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Pricing } from './pages/Pricing';
import { Guide } from './pages/Guide';
import { Download } from './pages/Download';
import { ForgotPassword, Login, Register, ResetPassword } from './pages/AuthPages';
import { Legal } from './pages/Legal';
import { NotFound } from './pages/NotFound';

// Signed-in pages load on first visit, so the public pages stay small
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then(module => ({ default: module[name] })));
const AccountOverview = named(() => import('./pages/account/Overview'), 'AccountOverview');
const Buy = named(() => import('./pages/account/Buy'), 'Buy');
const AccountSettings = named(() => import('./pages/account/Settings'), 'AccountSettings');
const AccountDevices = named(() => import('./pages/account/Devices'), 'AccountDevices');
const AccountInvite = named(() => import('./pages/account/Invite'), 'AccountInvite');
const AccountSupport = named(() => import('./pages/account/Support'), 'AccountSupport');
const AccountQuestions = named(() => import('./pages/account/Questions'), 'AccountQuestions');
const AccountProgress = named(() => import('./pages/account/Progress'), 'AccountProgress');
const AccountOrganization = named(() => import('./pages/account/Organization'), 'AccountOrganization');
const Join = named(() => import('./pages/Join'), 'Join');
const Colleges = named(() => import('./pages/Colleges'), 'Colleges');
const QuestionLibrary = named(() => import('./pages/Questions'), 'QuestionLibrary');
const QuestionPage = named(() => import('./pages/Questions'), 'QuestionPage');
const AdminQuestions = named(() => import('./pages/admin/Questions'), 'AdminQuestions');
const AdminOrganizations = named(() => import('./pages/admin/Organizations'), 'AdminOrganizations');
const AdminOrganizationDetail = named(() => import('./pages/admin/Organizations'), 'AdminOrganizationDetail');
const AdminReports = named(() => import('./pages/admin/Reports'), 'AdminReports');
const AdminCoupons = named(() => import('./pages/admin/Coupons'), 'AdminCoupons');
const AdminAnnouncements = named(() => import('./pages/admin/Announcements'), 'AdminAnnouncements');
const AdminSupport = named(() => import('./pages/admin/Support'), 'AdminSupport');
const AdminLayout = named(() => import('./pages/admin/AdminLayout'), 'AdminLayout');
const AdminDashboard = named(() => import('./pages/admin/Dashboard'), 'AdminDashboard');
const AdminUsers = named(() => import('./pages/admin/Users'), 'AdminUsers');
const AdminUserDetail = named(() => import('./pages/admin/UserDetail'), 'AdminUserDetail');
const AdminPayments = named(() => import('./pages/admin/Payments'), 'AdminPayments');
const AdminPlans = named(() => import('./pages/admin/Plans'), 'AdminPlans');
const AdminSettings = named(() => import('./pages/admin/Settings'), 'AdminSettings');
const AdminActivity = named(() => import('./pages/admin/Activity'), 'AdminActivity');

const Spinner = () => (
  <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
);

// Pages for signed-in users (and admins only, with `admin`)
const RequireAuth: React.FC<{ admin?: boolean; children: React.ReactNode }> = ({ admin, children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/account" replace />;
  return <>{children}</>;
};

// Scroll to the top on a new page, or to the #section in the address
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
};

export const App: React.FC = () => (
  <Layout>
    <ScrollToTop />
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/download" element={<Download />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/terms" element={<Legal page="terms" />} />
      <Route path="/privacy" element={<Legal page="privacy" />} />
      <Route path="/refunds" element={<Legal page="refunds" />} />
      <Route path="/contact" element={<Legal page="contact" />} />
      <Route path="/colleges" element={<Colleges />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/interview-questions" element={<QuestionLibrary />} />
      <Route path="/interview-questions/:category" element={<QuestionLibrary />} />
      <Route path="/interview-questions/:category/:slug" element={<QuestionPage />} />

      <Route path="/account" element={<RequireAuth><AccountOverview /></RequireAuth>} />
      <Route path="/account/buy" element={<RequireAuth><Buy /></RequireAuth>} />
      <Route path="/account/settings" element={<RequireAuth><AccountSettings /></RequireAuth>} />
      <Route path="/account/devices" element={<RequireAuth><AccountDevices /></RequireAuth>} />
      <Route path="/account/invite" element={<RequireAuth><AccountInvite /></RequireAuth>} />
      <Route path="/account/support" element={<RequireAuth><AccountSupport /></RequireAuth>} />
      <Route path="/account/support/:id" element={<RequireAuth><AccountSupport /></RequireAuth>} />
      <Route path="/account/questions" element={<RequireAuth><AccountQuestions /></RequireAuth>} />
      <Route path="/account/progress" element={<RequireAuth><AccountProgress /></RequireAuth>} />
      <Route path="/account/organization" element={<RequireAuth><AccountOrganization /></RequireAuth>} />

      <Route path="/admin" element={<RequireAuth admin><AdminLayout /></RequireAuth>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserDetail />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="support/:id" element={<AdminSupport />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="activity" element={<AdminActivity />} />
        <Route path="questions" element={<AdminQuestions />} />
        <Route path="organizations" element={<AdminOrganizations />} />
        <Route path="organizations/:id" element={<AdminOrganizationDetail />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  </Layout>
);
