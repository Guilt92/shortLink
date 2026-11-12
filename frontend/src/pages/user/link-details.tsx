import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { CopyButton } from "@/components/copy-button";
import { LinkActions } from "@/components/link-actions";
import { BarBreakdown, DonutBreakdown, RangeControls, TimeSeriesChart, useRange } from "@/components/charts";
import { ErrorState } from "@/components/states";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { MousePointerClick, Users } from "lucide-react";
import type { Link as LinkT, LinkStats } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1 py-2.5 sm:grid-cols-[140px_1fr] sm:gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{children}</dd></div>;
}

export default function LinkDetails() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const range = useRange(30);
  const link = useQuery({ queryKey: ["link", code], queryFn: () => api<LinkT>(`/links/${encodeURIComponent(code)}`), retry: false });
  const stats = useQuery({ queryKey: ["link-stats", code, range.days, range.granularity], enabled: link.isSuccess, queryFn: () => api<LinkStats>(`/links/${encodeURIComponent(code)}/stats`, { query: { days: range.days, granularity: range.granularity } }) });

  if (link.isError) {
    const notFound = link.error instanceof ApiError && link.error.status === 404;
    return <Card><ErrorState message={notFound ? "This link does not exist or you don't have access to it." : errorMessage(link.error)} onRetry={notFound ? () => nav("/links") : () => void link.refetch()} /></Card>;
  }
  const l = link.data;
  const s = stats.data;
  const err = stats.isError ? errorMessage(stats.error) : null;
  const retry = () => void stats.refetch();
  return (
    <>
      <PageHeader title={l ? l.shortUrl.replace(/^https?:\/\//, "") : "Link details"} description="Details and analytics for this short link.">
        <Button variant="outline" asChild><Link to="/links"><ArrowLeft />All links</Link></Button>
        {l && <LinkActions link={l} />}
      </PageHeader>

      <Card>
        <CardHeader><CardTitle>Link information</CardTitle></CardHeader>
        <CardContent>
          {!l ? <Skeleton className="h-32 w-full" /> : (
            <dl className="divide-y text-sm">
              <Row label="Short URL"><span className="inline-flex max-w-full items-center gap-1 break-all"><a href={l.shortUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{l.shortUrl}</a><CopyButton value={l.shortUrl} /></span></Row>
              <Row label="Destination"><a href={l.targetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all hover:underline">{l.targetUrl}<ExternalLink className="size-3 shrink-0" /></a></Row>
              <Row label="Status"><StatusBadge status={l.status} />{l.disabledByAdmin && <span className="ml-2 text-xs text-muted-foreground">Disabled by an administrator</span>}</Row>
              <Row label="Created">{formatDate(l.createdAt, true)}</Row>
              <Row label="Expires">{l.expiresAt ? formatDate(l.expiresAt, true) : "Never"}</Row>
              <Row label="Custom domain">{l.domain ?? "Default domain"}</Row>
              <Row label="QR code"><img alt={`QR code for ${l.shortUrl}`} src={`/api/links/${encodeURIComponent(l.code)}/qr.svg`} className="size-28 rounded border bg-white p-1" /></Row>
            </dl>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Analytics</h2><RangeControls range={range} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title="Clicks" icon={MousePointerClick} value={s?.clicks} loading={stats.isLoading} hint={`in the last ${range.days} days`} />
        <StatCard title="Unique visitors" icon={Users} value={s?.uniqueVisitors} loading={stats.isLoading} hint="estimated from hashed IP + browser" />
      </div>
      <TimeSeriesChart title="Clicks over time" data={s?.series as never} loading={stats.isLoading} error={err} onRetry={retry} series={[{ key: "clicks", label: "Clicks" }, { key: "visitors", label: "Unique visitors" }]} />
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <BarBreakdown title="Top referrers" description="Where visitors came from" data={s?.referrers} loading={stats.isLoading} error={err} onRetry={retry} />
        <DonutBreakdown title="Devices" data={s?.devices} loading={stats.isLoading} error={err} onRetry={retry} />
        <BarBreakdown title="Browsers" data={s?.browsers} loading={stats.isLoading} error={err} onRetry={retry} />
        <DonutBreakdown title="Operating systems" data={s?.operatingSystems} loading={stats.isLoading} error={err} onRetry={retry} />
      </div>
      <p className="text-xs text-muted-foreground">Country data is not collected.</p>
    </>
  );
}
