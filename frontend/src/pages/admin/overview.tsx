import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Flag, Link2, Link as LinkIcon, MousePointerClick, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { BarBreakdown, RangeControls, TimeSeriesChart, useRange } from "@/components/charts";
import { EmptyState, ErrorState } from "@/components/states";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { AdminOverview } from "@/lib/types";

const target = { user: "/admin/users", link: "/admin/links", report: "/admin/reports", audit: "/admin/audit" } as const;

export default function AdminOverviewPage() {
  const range = useRange(30);
  const q = useQuery({ queryKey: ["admin", "overview", range.days, range.granularity], queryFn: () => api<AdminOverview>("/admin/overview", { query: { days: range.days, granularity: range.granularity } }) });
  const d = q.data;
  const err = q.isError ? errorMessage(q.error) : null;
  const retry = () => void q.refetch();
  const t = d?.totals;
  return (
    <>
      <PageHeader title="Admin Overview" description="Platform health at a glance."><RangeControls range={range} /></PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total users" icon={Users} value={t?.users} loading={q.isLoading} />
        <StatCard title="Active users" icon={UserCheck} value={t?.activeUsers} loading={q.isLoading} hint="signed in within 30 days" />
        <StatCard title="Total links" icon={Link2} value={t?.links} loading={q.isLoading} />
        <StatCard title="Active links" icon={LinkIcon} value={t?.activeLinks} loading={q.isLoading} />
        <StatCard title="Total clicks" icon={MousePointerClick} value={t?.clicks} loading={q.isLoading} hint="all time" />
        <StatCard title="Pending abuse reports" icon={Flag} value={t?.pendingReports} loading={q.isLoading} hint={t?.pendingReports ? "need review" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <TimeSeriesChart title="User registrations" data={d?.registrations as never} series={[{ key: "count", label: "Registrations" }]} loading={q.isLoading} error={err} onRetry={retry} />
        <TimeSeriesChart title="Links created" data={d?.linkCreations as never} series={[{ key: "count", label: "Links" }]} loading={q.isLoading} error={err} onRetry={retry} />
      </div>
      <TimeSeriesChart title="Platform click activity" data={d?.clickSeries as never} series={[{ key: "clicks", label: "Clicks" }, { key: "visitors", label: "Unique visitors" }]} loading={q.isLoading} error={err} onRetry={retry} />
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <BarBreakdown title="Usage distribution" description={d ? `Top users by links created · ${d.usage.anonymousLinks} anonymous link(s)` : "Top users by links created"} unit="Links" data={d?.usage.topUsers} loading={q.isLoading} error={err} onRetry={retry} />
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0">
            {q.isLoading ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={retry} />
              : d!.recentActivity.length === 0 ? <EmptyState title="No activity yet" />
              : <ul className="divide-y">{d!.recentActivity.map((a, i) => (
                  <li key={i}><Link to={target[a.kind]} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted/50"><span className="truncate">{a.label}</span><span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.at, true)}</span></Link></li>
                ))}</ul>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
