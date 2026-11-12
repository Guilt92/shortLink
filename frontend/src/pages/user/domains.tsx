import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Globe, PlusCircle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CopyButton } from "@/components/copy-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Field } from "@/components/field";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Domain } from "@/lib/types";

function DnsInstructions({ d }: { d: Domain }) {
  const rec = (r: { type: string; name: string; value: string }) => (
    <div className="grid gap-1 rounded-md border p-3 text-sm">
      <div className="flex justify-between text-xs text-muted-foreground"><span>Type</span><span className="font-mono">{r.type}</span></div>
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Name</span><span className="flex min-w-0 items-center"><code className="truncate">{r.name}</code><CopyButton value={r.name} /></span></div>
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Value</span><span className="flex min-w-0 items-center"><code className="truncate">{r.value}</code><CopyButton value={r.value} /></span></div>
    </div>
  );
  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-2"><p className="font-medium">1. Prove ownership</p><p className="text-muted-foreground">Add this TXT record at your DNS provider, then press Verify.</p>{rec(d.dns.txt)}</div>
      <div className="grid gap-2"><p className="font-medium">2. Route traffic</p><p className="text-muted-foreground">{d.dns.route.note}</p>{rec(d.dns.route)}</div>
    </div>
  );
}

export default function Domains() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["domains"], queryFn: () => api<Domain[]>("/domains") });
  const [adding, setAdding] = useState(false);
  const [host, setHost] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<Domain | null>(null);
  const [removing, setRemoving] = useState<Domain | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["domains"] });

  const add = useMutation({
    mutationFn: () => api<Domain>("/domains", { method: "POST", body: { hostname: host } }),
    onSuccess: (d) => { setAdding(false); setHost(""); refresh(); setInstructions(d); toast.success("Domain added. Complete the DNS setup to verify it."); },
    onError: (e) => setAddError(errorMessage(e)),
  });
  const verify = useMutation({
    mutationFn: (id: number) => api<Domain>(`/domains/${id}/verify`, { method: "POST" }),
    onSuccess: (d) => { toast.success(`${d.hostname} is verified`); refresh(); setInstructions(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/domains/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Domain removed"); refresh(); void qc.invalidateQueries({ queryKey: ["links"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Custom Domains" description="Serve your short links from your own domain.">
        <Button onClick={() => { setAddError(null); setAdding(true); }}><PlusCircle />Add Domain</Button>
      </PageHeader>
      <Card>
        {q.isLoading ? <CardContent className="space-y-3 p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</CardContent>
          : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          : q.data!.length === 0 ? <EmptyState icon={Globe} title="No custom domains" description="Add a domain you own, prove ownership with a DNS TXT record, and use it for your short links." action={<Button onClick={() => setAdding(true)}><PlusCircle />Add Domain</Button>} />
          : (
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Domain</TableHead><TableHead>Verification</TableHead><TableHead className="hidden sm:table-cell">Links</TableHead><TableHead className="hidden sm:table-cell">Added</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{q.data!.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.hostname}</TableCell>
                  <TableCell><StatusBadge status={d.verified ? "verified" : "unverified"} /></TableCell>
                  <TableCell className="hidden sm:table-cell">{d.linkCount}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(d.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {!d.verified && <Button variant="outline" size="sm" loading={verify.isPending && verify.variables === d.id} onClick={() => verify.mutate(d.id)}><RefreshCw />Verify</Button>}
                      <Button variant="ghost" size="sm" aria-label={`DNS instructions for ${d.hostname}`} onClick={() => setInstructions(d)}><BookOpen /><span className="hidden md:inline">DNS</span></Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Remove ${d.hostname}`} onClick={() => setRemoving(d)}><Trash2 /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
      </Card>
      <p className="text-xs text-muted-foreground">TLS certificates are not issued by this app. Terminate HTTPS for your domain in your reverse proxy or CDN.</p>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!host.trim()) return setAddError("Enter a domain"); setAddError(null); add.mutate(); }}>
            <DialogHeader><DialogTitle>Add a custom domain</DialogTitle><DialogDescription>Use a subdomain you control, for example links.example.com.</DialogDescription></DialogHeader>
            <Field id="host" label="Domain" error={addError}><Input id="host" placeholder="links.example.com" value={host} onChange={(e) => setHost(e.target.value)} aria-invalid={!!addError} autoFocus /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" loading={add.isPending}>Add domain</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!instructions} onOpenChange={(o) => !o && setInstructions(null)}>
        <DialogContent>
          {instructions && (<>
            <DialogHeader><DialogTitle>DNS setup for {instructions.hostname}</DialogTitle><DialogDescription>{instructions.verified ? "This domain is verified." : "DNS changes can take a while to propagate."}</DialogDescription></DialogHeader>
            {instructions.verified && <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />Ownership verified {formatDate(instructions.verifiedAt)}</p>}
            <DnsInstructions d={instructions} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setInstructions(null)}>Close</Button>
              {!instructions.verified && <Button loading={verify.isPending} onClick={() => verify.mutate(instructions.id)}><RefreshCw />Verify now</Button>}
            </DialogFooter>
          </>)}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} destructive title={`Remove ${removing?.hostname}?`} confirmLabel="Remove"
        description="Existing links keep working but will be shown with the default domain." onConfirm={() => removing && remove.mutate(removing.id)} />
    </>
  );
}
