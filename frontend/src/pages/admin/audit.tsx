import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { useDebounce } from "@/components/use-debounce";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { AuditEntry, Page } from "@/lib/types";

export default function AdminAudit() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounce(search);
  const q = useQuery({ queryKey: ["admin", "audit", dq, page], queryFn: () => api<Page<AuditEntry>>("/admin/audit", { query: { q: dq, page, perPage: 25 } }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Audit Logs" description="Security-relevant events and administrative actions." />
      <Card>
        <div className="border-b p-3"><div className="relative max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Filter by action or target ID" aria-label="Filter audit log" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div></div>
        {q.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          : q.data!.total === 0 ? <EmptyState icon={History} title="No entries" description={dq ? "Nothing matches this filter." : "Events will be recorded here."} />
          : (<>
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead className="hidden sm:table-cell">Target</TableHead><TableHead className="hidden lg:table-cell">Details</TableHead></TableRow></TableHeader>
              <TableBody>{q.data!.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(a.createdAt, true)}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{a.actorEmail ?? (a.actorId ? `#${a.actorId} (deleted)` : "System")}</TableCell>
                  <TableCell><code className="text-xs">{a.action}</code></TableCell>
                  <TableCell className="hidden sm:table-cell">{a.targetType ? `${a.targetType}:${a.targetId}` : "—"}</TableCell>
                  <TableCell className="hidden max-w-[260px] truncate font-mono text-xs text-muted-foreground lg:table-cell">{a.details ? JSON.stringify(a.details) : ""}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pagination page={q.data!.page} perPage={q.data!.perPage} total={q.data!.total} onPage={setPage} />
          </>)}
      </Card>
    </>
  );
}
