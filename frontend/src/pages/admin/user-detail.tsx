import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { LinkTable } from "@/components/link-table";
import { EmptyState, ErrorState } from "@/components/states";
import { UserActionDialog, UserMenu } from "@/pages/admin/users";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Globe, Link2, MousePointerClick } from "lucide-react";
import type { AdminUserRow, Link as LinkT } from "@/lib/types";

interface Detail { user: AdminUserRow; usage: { links: number; clicks: number; domains: number }; recentLinks: LinkT[]; activity: { action: string; at: string }[] }

export default function AdminUserDetail() {
  const { id } = useParams();
  const [pending, setPending] = useState<Parameters<typeof UserActionDialog>[0]["pending"]>(null);
  const q = useQuery({ queryKey: ["admin", "user", id], queryFn: () => api<Detail>(`/admin/users/${id}`), retry: false });
  if (q.isError) return <Card><ErrorState message={q.error instanceof ApiError && q.error.status === 404 ? "This user does not exist." : errorMessage(q.error)} /></Card>;
  const d = q.data;
  const perms = d?.user.role === "super_admin" ? "Full access, including role changes, settings and user deletion." : d?.user.role === "admin" ? "Can moderate users, links, domains and reports. Cannot change roles, settings or delete users." : "Can manage their own links and domains only.";
  return (
    <>
      <PageHeader title={d?.user.name ?? "User"} description={d?.user.email}>
        <Button variant="outline" asChild><Link to="/admin/users"><ArrowLeft />All users</Link></Button>
        {d && <UserMenu u={d.user} onAction={setPending} />}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Links" icon={Link2} value={d?.usage.links} loading={q.isLoading} />
        <StatCard title="Total clicks" icon={MousePointerClick} value={d?.usage.clicks} loading={q.isLoading} />
        <StatCard title="Custom domains" icon={Globe} value={d?.usage.domains} loading={q.isLoading} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent>{!d ? <Skeleton className="h-32 w-full" /> : (
            <div className="grid gap-4 text-sm">
              <div className="flex items-center gap-3"><UserAvatar name={d.user.name} className="size-10" /><div className="flex gap-2"><StatusBadge status={d.user.role} /><StatusBadge status={d.user.status} /></div></div>
              <dl className="grid grid-cols-[120px_1fr] gap-y-2">
                <dt className="text-muted-foreground">Registered</dt><dd>{formatDate(d.user.createdAt, true)}</dd>
                <dt className="text-muted-foreground">Last sign-in</dt><dd>{d.user.lastLoginAt ? formatDate(d.user.lastLoginAt, true) : "Never"}</dd>
                <dt className="text-muted-foreground">Permissions</dt><dd>{perms}</dd>
              </dl>
            </div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0">{!d ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : d.activity.length === 0 ? <EmptyState title="No recorded activity" /> :
            <ul className="divide-y">{d.activity.map((a, i) => <li key={i} className="flex justify-between gap-2 px-5 py-2.5 text-sm"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-muted-foreground">{formatDate(a.at, true)}</span></li>)}</ul>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Recent links</CardTitle></CardHeader>
        <CardContent className="p-0">{!d ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : d.recentLinks.length === 0 ? <EmptyState icon={Link2} title="No links" description="This user hasn't created any links." /> : <LinkTable links={d.recentLinks} showOwner actions={() => null} />}</CardContent>
      </Card>
      <UserActionDialog pending={pending} onClose={() => setPending(null)} />
    </>
  );
}
