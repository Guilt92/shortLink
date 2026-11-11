import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Power, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { LinkTable, type SortState } from "@/components/link-table";
import { Pagination } from "@/components/pagination";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { useDebounce } from "@/components/use-debounce";
import { api, errorMessage } from "@/lib/api";
import { MoreHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { Link, Page } from "@/lib/types";

export default function AdminLinks() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("all");
  const [domain, setDomain] = useState("");
  const [userId, setUserId] = useState(params.get("userId") ?? "");
  const [sort, setSort] = useState<SortState>({ sort: "created", order: "desc" });
  const [page, setPage] = useState(1);
  const [del, setDel] = useState<Link | null>(null);
  const dq = useDebounce(search);
  const dd = useDebounce(domain);
  const du = useDebounce(userId);
  const filtered = !!(dq || dd || du || status !== "all");
  const q = useQuery({
    queryKey: ["admin", "links", { dq, dd, du, status, sort, page }],
    queryFn: () => api<Page<Link>>("/admin/links", { query: { q: dq, domain: dd, userId: /^\d+$/.test(du) ? du : undefined, status: status === "all" ? undefined : status, sort: sort.sort, order: sort.order, page, perPage: 15 } }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "links"] }); void qc.invalidateQueries({ queryKey: ["admin", "overview"] }); };
  const toggle = useMutation({
    mutationFn: (l: Link) => api(`/admin/links/${l.code}`, { method: "PATCH", body: { disabled: !l.disabledByAdmin } }),
    onSuccess: (_, l) => { toast.success(l.disabledByAdmin ? "Link re-enabled" : "Link disabled"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (l: Link) => api(`/admin/links/${l.code}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Link deleted"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const clear = () => { setSearch(""); setDomain(""); setUserId(""); setStatus("all"); setPage(1); };
  return (
    <>
      <PageHeader title="All Links" description="Every link on the platform. Disabling a link stops it from redirecting; the owner cannot re-enable it." />
      <Card>
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search by code or destination URL" aria-label="Search links" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
          <Input className="lg:w-44" placeholder="Domain" aria-label="Filter by domain" value={domain} onChange={(e) => { setDomain(e.target.value); setPage(1); }} />
          <Input className="lg:w-28" placeholder="User ID" inputMode="numeric" aria-label="Filter by user ID" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}><SelectTrigger className="lg:w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select>
          {filtered && <Button variant="ghost" size="sm" onClick={clear}><X />Clear</Button>}
        </div>
        {q.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          : q.data!.total === 0 ? <EmptyState icon={Link2} title="No links found" description={filtered ? "Try different filters." : "No links have been created yet."} />
          : (<>
            <LinkTable showOwner links={q.data!.items} sort={sort} onSort={(s) => { setSort(s); setPage(1); }} actions={(l) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${l.code}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => window.open(l.targetUrl, "_blank", "noopener,noreferrer")}><ExternalLink />Inspect destination</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => toggle.mutate(l)}><Power />{l.disabledByAdmin ? "Re-enable" : "Disable"}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setDel(l)}><Trash2 />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )} />
            <Pagination page={q.data!.page} perPage={q.data!.perPage} total={q.data!.total} onPage={setPage} />
          </>)}
      </Card>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} destructive title={`Delete /${del?.code}?`} confirmLabel="Delete" description="The link and its analytics will be permanently removed. This is recorded in the audit log." onConfirm={() => del && remove.mutate(del)} />
    </>
  );
}
