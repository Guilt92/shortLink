import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

const l = <T extends { default: React.ComponentType }>(f: () => Promise<T>) => lazy(f);
const Login = l(() => import("@/pages/auth/login"));
const Register = l(() => import("@/pages/auth/register"));
const Forgot = l(() => import("@/pages/auth/forgot"));
const Reset = l(() => import("@/pages/auth/reset"));
const Report = l(() => import("@/pages/report"));
const NotFound = l(() => import("@/pages/not-found"));
const Overview = l(() => import("@/pages/user/overview"));
const Links = l(() => import("@/pages/user/links"));
const CreateLink = l(() => import("@/pages/user/create-link"));
const LinkDetails = l(() => import("@/pages/user/link-details"));
const Analytics = l(() => import("@/pages/user/analytics"));
const QrCodes = l(() => import("@/pages/user/qr-codes"));
const Domains = l(() => import("@/pages/user/domains"));
const Profile = l(() => import("@/pages/user/profile"));
const UserSettings = l(() => import("@/pages/user/settings"));
const AdminOverview = l(() => import("@/pages/admin/overview"));
const AdminUsers = l(() => import("@/pages/admin/users"));
const AdminUserDetail = l(() => import("@/pages/admin/user-detail"));
const AdminLinks = l(() => import("@/pages/admin/links"));
const AdminDomains = l(() => import("@/pages/admin/domains"));
const AdminAnalytics = l(() => import("@/pages/admin/analytics"));
const AdminReports = l(() => import("@/pages/admin/reports"));
const AdminAudit = l(() => import("@/pages/admin/audit"));
const AdminSettings = l(() => import("@/pages/admin/settings"));

function Fallback() {
  return <div className="space-y-4 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
}

function Guard({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Fallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  // UI guard only; every admin API call is authorised again on the server.
  if (admin && user.role === "user") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Fallback />;
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><Forgot /></GuestOnly>} />
        <Route path="/reset-password" element={<Reset />} />
        <Route path="/report" element={<Report />} />

        <Route element={<Guard><AppShell /></Guard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Overview />} />
          <Route path="/links" element={<Links />} />
          <Route path="/links/new" element={<CreateLink />} />
          <Route path="/links/:code" element={<LinkDetails />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/qr-codes" element={<QrCodes />} />
          <Route path="/domains" element={<Domains />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<UserSettings />} />
        </Route>

        <Route element={<Guard admin><AppShell admin /></Guard>}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          <Route path="/admin/links" element={<AdminLinks />} />
          <Route path="/admin/domains" element={<AdminDomains />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
