import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Domain } from "@/lib/types";

export default function AdminDomains() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "domains"], queryFn: () => api<Domain[]>("/admin/domains") });
  const [del, setDel] = useState<Domain | null>(null);
  const remove = useMutation({
    mutationFn: (d: Domain) => api(`/admin/domains/${d.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Domain removed"); void qc.invalidateQueries({ queryKey: ["admin", "domains"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Custom Domains" description="Domains registered by users. Verification status comes from a live DNS TXT lookup." />
      <Card>
        {q.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          : q.data!.length === 0 ? <EmptyState icon={Globe} title="No custom domains" description="Nobody has added a custom domain yet." />
          : (
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Domain</TableHead><TableHead className="hidden sm:table-cell">Owner</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Links</TableHead><TableHead className="hidden md:table-cell">Added</TableHead><TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{q.data!.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.hostname}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{d.ownerEmail}</TableCell>
                  <TableCell><StatusBadge status={d.verified ? "verified" : "unverified"} /></TableCell>
                  <TableCell className="hidden md:table-cell">{d.linkCount}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(d.createdAt)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Remove ${d.hostname}`} onClick={() => setDel(d)}><Trash2 /></Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
      </Card>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} destructive title={`Remove ${del?.hostname}?`} confirmLabel="Remove" description="Links using this domain fall back to the default domain. This is recorded in the audit log." onConfirm={() => del && remove.mutate(del)} />
    </>
  );
}
