import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Link2, MousePointerClick, PlusCircle, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { RangeControls, TimeSeriesChart, useRange } from "@/components/charts";
import { LinkTable } from "@/components/link-table";
import { EmptyState, ErrorState } from "@/components/states";
import { api, errorMessage } from "@/lib/api";
import { percentChange } from "@/lib/utils";
import type { Overview } from "@/lib/types";

export default function OverviewPage() {
  const range = useRange(30);
  const q = useQuery({ queryKey: ["overview", range.days, range.granularity], queryFn: () => api<Overview>("/stats/overview", { query: { days: range.days, granularity: range.granularity } }) });
  const d = q.data;
  const period = `in the last ${range.days} days`;
  return (
    <>
      <PageHeader title="Overview" description="A summary of your links and how they are performing.">
        <RangeControls range={range} />
        <Button asChild><Link to="/links/new"><PlusCircle />Create Short Link</Link></Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Links" icon={Link2} value={d?.totalLinks} loading={q.isLoading} hint="All time" />
        <StatCard title="Total Clicks" icon={MousePointerClick} value={d?.clicks} loading={q.isLoading} change={d ? percentChange(d.clicks, d.previousClicks) : null} hint={`${period}`} />
        <StatCard title="Unique Visitors" icon={Users} value={d?.uniqueVisitors} loading={q.isLoading} change={d ? percentChange(d.uniqueVisitors, d.previousUniqueVisitors) : null} hint={period} />
        <StatCard title="Active Links" icon={Zap} value={d?.activeLinks} loading={q.isLoading} hint="Currently redirecting" />
      </div>

      <TimeSeriesChart title="Click activity" description={`Clicks and unique visitors ${period}`} data={d?.series as never} loading={q.isLoading} error={q.isError ? errorMessage(q.error) : null} onRetry={() => void q.refetch()}
        series={[{ key: "clicks", label: "Clicks" }, { key: "visitors", label: "Unique visitors" }]} />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent links</CardTitle>
          <Button variant="ghost" size="sm" asChild><Link to="/links">View all</Link></Button>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
            : d && d.recentLinks.length === 0 ? <EmptyState icon={BarChart3} title="No links yet" description="Create your first short link to start tracking clicks." action={<Button asChild><Link to="/links/new"><PlusCircle />Create Short Link</Link></Button>} />
            : <LinkTable links={d!.recentLinks} />}
        </CardContent>
      </Card>
    </>
  );
}
