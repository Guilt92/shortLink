import type { ComponentType } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatNumber } from "@/lib/utils";

export function StatCard({ title, value, icon: Icon, change, hint, loading }: {
  title: string; value?: number; icon: ComponentType<{ className?: string }>; change?: number | null; hint?: string; loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold tabular-nums">{formatNumber(value ?? 0)}</div>}
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {change != null && !loading && (
            <span className={cn("inline-flex items-center font-medium", change >= 0 ? "text-success" : "text-destructive")}>
              {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(change)}%
            </span>
          )}
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}
