import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, MoreHorizontal, Search, ShieldCheck, Trash2, UserCheck, UserX, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { useDebounce } from "@/components/use-debounce";
import { useAuth } from "@/lib/auth";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { AdminUserRow, Page, Role } from "@/lib/types";

type Pending = { kind: "suspend" | "activate" | "delete" | "role"; user: AdminUserRow; role?: Role };

export function useUserMutations() {
  const qc = useQueryClient();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "users"] }); void qc.invalidateQueries({ queryKey: ["admin", "user"] }); void qc.invalidateQueries({ queryKey: ["admin", "overview"] }); };
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, string> }) => api(`/admin/users/${id}`, { method: "PATCH", body }),
    onSuccess: () => { toast.success("User updated"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("User deleted"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return { patch, remove };
}

export function UserActionDialog({ pending, onClose }: { pending: Pending | null; onClose: () => void }) {
  const { patch, remove } = useUserMutations();
  if (!pending) return null;
  const { kind, user, role } = pending;
  const cfg = {
    suspend: { title: `Suspend ${user.email}?`, text: "They will be signed out immediately and cannot sign in until reactivated.", label: "Suspend", destructive: true },
    activate: { title: `Reactivate ${user.email}?`, text: "They will be able to sign in again.", label: "Reactivate", destructive: false },
    delete: { title: `Delete ${user.email}?`, text: "This permanently deletes the account, all of their links and analytics. This cannot be undone.", label: "Delete user", destructive: true },
    role: { title: `Change role to ${role}?`, text: `${user.email} will be signed out and receive the permissions of this role.`, label: "Change role", destructive: false },
  }[kind];
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={cfg.title} description={cfg.text} confirmLabel={cfg.label} destructive={cfg.destructive}
      onConfirm={() => {
        if (kind === "delete") remove.mutate(user.id);
        else if (kind === "role") patch.mutate({ id: user.id, body: { role: role! } });
        else patch.mutate({ id: user.id, body: { status: kind === "suspend" ? "suspended" : "active" } });
      }} />
  );
}

export function UserMenu({ u, onAction }: { u: AdminUserRow; onAction: (p: Pending) => void }) {
  const { user: me } = useAuth();
  const isSuper = me?.role === "super_admin";
  const self = me?.id === u.id;
  const locked = u.role === "super_admin" && !isSuper;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${u.email}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to={`/admin/users/${u.id}`}><Eye />View details</Link></DropdownMenuItem>
        {!self && !locked && (u.status === "active"
          ? <DropdownMenuItem onSelect={() => onAction({ kind: "suspend", user: u })}><UserX />Suspend</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => onAction({ kind: "activate", user: u })}><UserCheck />Reactivate</DropdownMenuItem>)}
        {isSuper && !self && (["user", "admin", "super_admin"] as Role[]).filter((r) => r !== u.role).map((r) => (
          <DropdownMenuItem key={r} onSelect={() => onAction({ kind: "role", user: u, role: r })}><ShieldCheck />Make {r.replace("_", " ")}</DropdownMenuItem>
        ))}
        {isSuper && !self && (<><DropdownMenuSeparator /><DropdownMenuItem destructive onSelect={() => onAction({ kind: "delete", user: u })}><Trash2 />Delete</DropdownMenuItem></>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState({ sort: "created", order: "desc" as "asc" | "desc" });
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const dq = useDebounce(search);
  const filtered = !!(dq || role !== "all" || status !== "all");
  const q = useQuery({
    queryKey: ["admin", "users", { dq, role, status, sort, page }],
    queryFn: () => api<Page<AdminUserRow>>("/admin/users", { query: { q: dq, role: role === "all" ? undefined : role, status: status === "all" ? undefined : status, sort: sort.sort, order: sort.order, page, perPage: 15 } }),
    placeholderData: keepPreviousData,
  });
  const head = (id: string, label: string, cls?: string) => {
    const active = sort.sort === id;
    const Icon = !active ? ArrowUpDown : sort.order === "asc" ? ArrowUp : ArrowDown;
    return <TableHead className={cls} aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}><button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setSort({ sort: id, order: active && sort.order === "desc" ? "asc" : "desc" }); setPage(1); }}>{label}<Icon className="size-3" /></button></TableHead>;
  };
  const clear = () => { setSearch(""); setRole("all"); setStatus("all"); setPage(1); };
  return (
    <>
      <PageHeader title="Users" description="Search, review and manage accounts." />
      <Card>
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search by name or email" aria-label="Search users" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
          <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}><SelectTrigger className="w-36" aria-label="Filter by role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="user">User</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="super_admin">Super admin</SelectItem></SelectContent></Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}><SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select>
          {filtered && <Button variant="ghost" size="sm" onClick={clear}><X />Clear</Button>}
        </div>
        {q.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          : q.data!.total === 0 ? <EmptyState icon={Users} title="No users found" description={filtered ? "Try different filters." : undefined} action={filtered && <Button variant="outline" onClick={clear}>Clear filters</Button>} />
          : (<>
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">{head("name", "User")}{head("role", "Role", "hidden sm:table-cell")}<TableHead>Status</TableHead>{head("links", "Links", "hidden md:table-cell")}{head("created", "Registered", "hidden lg:table-cell")}{head("lastLogin", "Last activity", "hidden lg:table-cell")}<TableHead className="w-12"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{q.data!.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell><div className="flex items-center gap-2.5"><UserAvatar name={u.name} /><div className="min-w-0"><Link to={`/admin/users/${u.id}`} className="block truncate font-medium hover:underline">{u.name}</Link><span className="block truncate text-xs text-muted-foreground">{u.email}</span></div></div></TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={u.role} /></TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{u.linkCount}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">{formatDate(u.createdAt)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">{u.lastLoginAt ? formatDate(u.lastLoginAt, true) : "Never"}</TableCell>
                  <TableCell><UserMenu u={u} onAction={setPending} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
            <Pagination page={q.data!.page} perPage={q.data!.perPage} total={q.data!.total} onPage={setPage} />
          </>)}
      </Card>
      <UserActionDialog pending={pending} onClose={() => setPending(null)} />
    </>
  );
}
