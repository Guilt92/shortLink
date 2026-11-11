import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MousePointerClick, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { BarBreakdown, DonutBreakdown, RangeControls, TimeSeriesChart, useRange } from "@/components/charts";
import { EmptyState } from "@/components/states";
import { api, errorMessage } from "@/lib/api";
import { formatNumber, percentChange } from "@/lib/utils";
import type { Analytics } from "@/lib/types";

export default function AdminAnalytics() {
  const range = useRange(30);
  const q = useQuery({ queryKey: ["admin", "analytics", range.days, range.granularity], queryFn: () => api<Analytics>("/admin/analytics", { query: { days: range.days, granularity: range.granularity } }) });
  const d = q.data;
  const err = q.isError ? errorMessage(q.error) : null;
  const retry = () => void q.refetch();
  return (
    <>
      <PageHeader title="Platform Analytics" description="Traffic across every link on the platform."><RangeControls range={range} /></PageHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title="Total clicks" icon={MousePointerClick} value={d?.clicks} loading={q.isLoading} change={d ? percentChange(d.clicks, d.previousClicks) : null} hint={`in the last ${range.days} days`} />
        <StatCard title="Unique visitors" icon={Users} value={d?.uniqueVisitors} loading={q.isLoading} hint="estimated from hashed IP + browser" />
      </div>
      <TimeSeriesChart title="Clicks over time" data={d?.series as never} loading={q.isLoading} error={err} onRetry={retry} series={[{ key: "clicks", label: "Clicks" }, { key: "visitors", label: "Unique visitors" }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <BarBreakdown title="Top referrers" data={d?.referrers} loading={q.isLoading} error={err} onRetry={retry} />
        <DonutBreakdown title="Devices" data={d?.devices} loading={q.isLoading} error={err} onRetry={retry} />
        <BarBreakdown title="Browsers" data={d?.browsers} loading={q.isLoading} error={err} onRetry={retry} />
        <DonutBreakdown title="Operating systems" data={d?.operatingSystems} loading={q.isLoading} error={err} onRetry={retry} />
      </div>
      <Card>
        <CardHeader><CardTitle>Top links</CardTitle></CardHeader>
        <CardContent className="p-0">
          {q.isLoading ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : !d || d.topLinks.length === 0 ? <EmptyState title="No clicks in this period" /> : (
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Short code</TableHead><TableHead className="hidden sm:table-cell">Destination</TableHead><TableHead className="text-right">Clicks</TableHead></TableRow></TableHeader>
              <TableBody>{d.topLinks.map((l) => (
                <TableRow key={l.code}><TableCell><Link className="font-medium hover:underline" to={`/admin/links?q=${encodeURIComponent(l.code)}`}>{l.code}</Link></TableCell><TableCell className="hidden max-w-xs truncate text-muted-foreground sm:table-cell">{l.targetUrl}</TableCell><TableCell className="text-right tabular-nums">{formatNumber(l.clicks)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
