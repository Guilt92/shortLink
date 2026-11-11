import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Page, Report } from "@/lib/types";

export default function AdminReports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Report | null>(null);
  const [disable, setDisable] = useState(false);
  const q = useQuery({ queryKey: ["admin", "reports", status, page], queryFn: () => api<Page<Report>>("/admin/reports", { query: { status: status === "all" ? undefined : status, page, perPage: 15 } }), placeholderData: keepPreviousData });
  const resolve = useMutation({
    mutationFn: ({ id, s }: { id: number; s: "resolved" | "rejected" }) => api(`/admin/reports/${id}`, { method: "PATCH", body: { status: s, disableLink: s === "resolved" && disable } }),
    onSuccess: (_, v) => { toast.success(`Report ${v.s}`); setOpen(null); void qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Abuse Reports" description="Review reports submitted through the public report form.">
        <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <TabsList><TabsTrigger value="pending">Pending</TabsTrigger><TabsTrigger value="resolved">Resolved</TabsTrigger><TabsTrigger value="rejected">Rejected</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>
        </Tabs>
      </PageHeader>
      <Card>
        {q.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          : q.data!.total === 0 ? <EmptyState icon={Flag} title="No reports" description={status === "pending" ? "Nothing is waiting for review." : "No reports match this filter."} />
          : (<>
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>ID</TableHead><TableHead>Reported URL</TableHead><TableHead className="hidden sm:table-cell">Reason</TableHead><TableHead className="hidden lg:table-cell">Reporter</TableHead><TableHead className="hidden md:table-cell">Submitted</TableHead><TableHead>Status</TableHead><TableHead className="hidden lg:table-cell">Assigned to</TableHead><TableHead className="w-24"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{q.data!.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">#{r.id}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.reportedUrl}</TableCell>
                  <TableCell className="hidden capitalize sm:table-cell">{r.reason}</TableCell>
                  <TableCell className="hidden max-w-[160px] truncate text-muted-foreground lg:table-cell">{r.reporter ?? "Anonymous"}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDate(r.createdAt, true)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{r.assignedEmail ?? "—"}</TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={() => { setDisable(false); setOpen(r); }}>View</Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pagination page={q.data!.page} perPage={q.data!.perPage} total={q.data!.total} onPage={setPage} />
          </>)}
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          {open && (<>
            <DialogHeader><DialogTitle>Report #{open.id}</DialogTitle><DialogDescription>Submitted {formatDate(open.createdAt, true)} · <span className="capitalize">{open.reason}</span></DialogDescription></DialogHeader>
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Reported URL</dt><dd className="break-all">{open.reportedUrl}</dd>
              <dt className="text-muted-foreground">Destination</dt>
              <dd className="break-all">{open.targetUrl ? <a href={open.targetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">{open.targetUrl}<ExternalLink className="size-3" /></a> : "Link no longer exists or could not be matched"}</dd>
              <dt className="text-muted-foreground">Link status</dt><dd>{open.linkStatus ? <StatusBadge status={open.linkStatus} /> : "—"}</dd>
              <dt className="text-muted-foreground">Reporter</dt><dd>{open.reporter ?? "Anonymous"}</dd>
              <dt className="text-muted-foreground">Details</dt><dd className="whitespace-pre-wrap break-words">{open.details ?? "—"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={open.status} />{open.assignedEmail && <span className="ml-2 text-xs text-muted-foreground">by {open.assignedEmail} · {formatDate(open.resolvedAt, true)}</span>}</dd>
            </dl>
            {open.status === "pending" && open.linkId && open.linkStatus !== "disabled" && (
              <div className="flex items-center gap-2"><Checkbox id="disable" checked={disable} onCheckedChange={(v) => setDisable(!!v)} /><Label htmlFor="disable" className="font-normal">Also disable the reported link</Label></div>
            )}
            {open.status === "pending" && (
              <DialogFooter>
                <Button variant="outline" loading={resolve.isPending} onClick={() => resolve.mutate({ id: open.id, s: "rejected" })}>Reject report</Button>
                <Button loading={resolve.isPending} onClick={() => resolve.mutate({ id: open.id, s: "resolved" })}>Resolve report</Button>
              </DialogFooter>
            )}
          </>)}
        </DialogContent>
      </Dialog>
    </>
  );
}
