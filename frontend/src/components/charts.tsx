import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/states";
import { formatNumber } from "@/lib/utils";
import type { NameCount } from "@/lib/types";

const COLORS = [1, 2, 3, 4, 5].map((n) => `hsl(var(--chart-${n}))`);

export type Granularity = "day" | "week" | "month";
export function useRange(initialDays = 30) {
  const [days, setDays] = useState(initialDays);
  const [granularity, setGranularity] = useState<Granularity>("day");
  return { days, setDays, granularity, setGranularity };
}

export function RangeControls({ range }: { range: ReturnType<typeof useRange> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(range.days)} onValueChange={(v) => range.setDays(Number(v))}>
        <SelectTrigger className="w-40" aria-label="Date range"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
          <SelectItem value="365">Last 12 months</SelectItem>
        </SelectContent>
      </Select>
      <Tabs value={range.granularity} onValueChange={(v) => range.setGranularity(v as Granularity)}>
        <TabsList aria-label="Granularity">
          <TabsTrigger value="day">Daily</TabsTrigger>
          <TabsTrigger value="week">Weekly</TabsTrigger>
          <TabsTrigger value="month">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

interface Series { key: string; label: string }
type Row = { bucket: string } & Record<string, number | string>;

function ChartCard({ title, description, loading, error, onRetry, empty, emptyText, children, className }: {
  title: string; description?: string; loading?: boolean; error?: string | null; onRetry?: () => void; empty?: boolean; emptyText?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-60 w-full" />
          : error ? <ErrorState message={error} onRetry={onRetry} />
          : empty ? <EmptyState icon={BarChart3} title="No data yet" description={emptyText ?? "Data will appear here once there is activity in this period."} />
          : children}
      </CardContent>
    </Card>
  );
}

export function TimeSeriesChart({ title, description, data, series, loading, error, onRetry, action, className }: {
  title: string; description?: string; data?: Row[]; series: Series[]; loading?: boolean; error?: string | null; onRetry?: () => void; action?: React.ReactNode; className?: string;
}) {
  const empty = !!data && data.every((r) => series.every((s) => !r[s.key]));
  return (
    <div className={className}>
      {action && <div className="mb-3">{action}</div>}
      <ChartCard title={title} description={description} loading={loading} error={error} onRetry={onRetry} empty={empty}>
        <div className="h-60 w-full" role="img" aria-label={`${title} chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                {series.map((s, i) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[i % 5]} stopOpacity={0.25} /><stop offset="95%" stopColor={COLORS[i % 5]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} allowDecimals={false} stroke="hsl(var(--muted-foreground))" tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip content={<ChartTooltip series={series} />} />
              {series.map((s, i) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % 5]} strokeWidth={2} fill={`url(#fill-${s.key})`} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

function ChartTooltip({ active, payload, label, series }: { active?: boolean; payload?: { dataKey?: string | number; value?: number }[]; label?: string; series: Series[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{series.find((s) => s.key === p.dataKey)?.label}</span>
          <span className="font-medium tabular-nums">{formatNumber(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

export function BarBreakdown({ title, description, data, loading, error, onRetry, unit = "Clicks" }: { unit?: string; title: string; description?: string; data?: NameCount[]; loading?: boolean; error?: string | null; onRetry?: () => void }) {
  const rows = data ?? [];
  return (
    <ChartCard title={title} description={description} loading={loading} error={error} onRetry={onRetry} empty={rows.length === 0}>
      <div className="w-full" style={{ height: Math.max(120, rows.length * 36 + 16) }} role="img" aria-label={`${title} chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--foreground))" tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} />
            <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltip series={[{ key: "count", label: unit }]} />} />
            <Bar dataKey="count" name={unit} fill={COLORS[0]} radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function DonutBreakdown({ title, description, data, loading, error, onRetry }: { title: string; description?: string; data?: NameCount[]; loading?: boolean; error?: string | null; onRetry?: () => void }) {
  const rows = data ?? [];
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <ChartCard title={title} description={description} loading={loading} error={error} onRetry={onRetry} empty={rows.length === 0}>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="h-40 w-40 shrink-0" role="img" aria-label={`${title} chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="count" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2} stroke="none">
                {rows.map((_, i) => <Cell key={i} fill={COLORS[i % 5]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip series={[{ key: "count", label: "Clicks" }]} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full space-y-1.5 text-sm">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % 5] }} /><span className="truncate">{r.name}</span></span>
              <span className="tabular-nums text-muted-foreground">{formatNumber(r.count)} · {Math.round((r.count / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
