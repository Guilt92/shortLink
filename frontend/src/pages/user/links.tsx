import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Power, PlusCircle, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { LinkTable, type SortState } from "@/components/link-table";
import { Pagination } from "@/components/pagination";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { useDebounce } from "@/components/use-debounce";
import { api, errorMessage } from "@/lib/api";
import type { Link as LinkT, Page } from "@/lib/types";

const PER_PAGE = 15;

export default function LinksPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortState>({ sort: "created", order: "desc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const debounced = useDebounce(search);

  const filtered = !!(debounced || status !== "all" || from || to);
  const q = useQuery({
    queryKey: ["links", { debounced, status, from, to, sort, page }],
    queryFn: () => api<Page<LinkT>>("/links", { query: { q: debounced, status: status === "all" ? undefined : status, createdFrom: from, createdTo: to, sort: sort.sort === "created" ? "created" : sort.sort, order: sort.order, page, perPage: PER_PAGE } }),
    placeholderData: keepPreviousData,
  });

  const reset = () => { setSearch(""); setStatus("all"); setFrom(""); setTo(""); setPage(1); setSelected(new Set()); };
  const bulk = useMutation({
    mutationFn: (action: "delete" | "enable" | "disable") => api<{ affected: number }>("/links/bulk", { method: "POST", body: { codes: [...selected], action } }),
    onSuccess: (r, action) => {
      toast.success(`${r.affected} link${r.affected === 1 ? "" : "s"} ${action === "delete" ? "deleted" : action === "enable" ? "enabled" : "disabled"}`);
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ["links"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="My Links" description="Search, filter and manage every short link you have created.">
        <Button asChild><Link to="/links/new"><PlusCircle />Create Short Link</Link></Button>
      </PageHeader>

      <Card>
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by short code or destination URL" aria-label="Search links" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-32" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent>
            </Select>
            <Input type="date" className="w-full sm:w-36" aria-label="Created from" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <Input type="date" className="w-full sm:w-36" aria-label="Created to" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            <Select value={`${sort.sort}:${sort.order}`} onValueChange={(v) => { const [s, o] = v.split(":"); setSort({ sort: s, order: o as "asc" | "desc" }); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Sort links"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created:desc">Newest first</SelectItem><SelectItem value="created:asc">Oldest first</SelectItem>
                <SelectItem value="clicks:desc">Most clicks</SelectItem><SelectItem value="clicks:asc">Fewest clicks</SelectItem>
                <SelectItem value="code:asc">Short URL A–Z</SelectItem><SelectItem value="target:asc">Destination A–Z</SelectItem>
              </SelectContent>
            </Select>
            {filtered && <Button variant="ghost" size="sm" onClick={reset}><X />Clear</Button>}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
            <span className="font-medium">{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={() => bulk.mutate("enable")} disabled={bulk.isPending}><Power />Enable</Button>
            <Button variant="outline" size="sm" onClick={() => bulk.mutate("disable")} disabled={bulk.isPending}><Power />Disable</Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={bulk.isPending}><Trash2 />Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</Button>
          </div>
        )}

        {q.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          : q.data && q.data.total === 0 ? (
            filtered
              ? <EmptyState icon={Search} title="No links match your filters" description="Try a different search term or clear the filters." action={<Button variant="outline" onClick={reset}>Clear filters</Button>} />
              : <EmptyState icon={Link2} title="Create your first short link" description="Short links are easier to share, and every click is tracked so you can see what works." action={<Button asChild><Link to="/links/new"><PlusCircle />Create Short Link</Link></Button>} />
          ) : (
            <>
              <LinkTable links={q.data!.items} selected={selected} onSelect={setSelected} sort={sort} onSort={(s) => { setSort(s); setPage(1); }} />
              <Pagination page={q.data!.page} perPage={q.data!.perPage} total={q.data!.total} onPage={(p) => { setPage(p); setSelected(new Set()); }} />
            </>
          )}
      </Card>

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} destructive title={`Delete ${selected.size} link${selected.size === 1 ? "" : "s"}?`} confirmLabel="Delete"
        description="These short URLs will stop working and their analytics will be permanently removed." onConfirm={() => bulk.mutate("delete")} />
    </>
  );
}
