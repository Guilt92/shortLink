import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { CopyButton } from "@/components/copy-button";
import { LinkActions } from "@/components/link-actions";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Link } from "@/lib/types";

export interface SortState { sort: string; order: "asc" | "desc" }

function SortHead({ id, label, sort, onSort, className }: { id: string; label: string; sort?: SortState; onSort?: (s: SortState) => void; className?: string }) {
  if (!onSort || !sort) return <TableHead className={className}>{label}</TableHead>;
  const active = sort.sort === id;
  const Icon = !active ? ArrowUpDown : sort.order === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort({ sort: id, order: active && sort.order === "desc" ? "asc" : "desc" })}>
        {label}<Icon className="size-3" />
      </button>
    </TableHead>
  );
}

export function LinkTable({ links, selected, onSelect, sort, onSort, showOwner, actions }: {
  links: Link[]; selected?: Set<string>; onSelect?: (s: Set<string>) => void; sort?: SortState; onSort?: (s: SortState) => void; showOwner?: boolean; actions?: (l: Link) => ReactNode;
}) {
  const selectable = !!selected && !!onSelect;
  const allSelected = selectable && links.length > 0 && links.every((l) => selected!.has(l.code));
  const toggle = (code: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(code); else next.delete(code);
    onSelect!(next);
  };
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {selectable && <TableHead className="w-10"><Checkbox checked={allSelected} aria-label="Select all" onCheckedChange={(v) => onSelect!(v ? new Set(links.map((l) => l.code)) : new Set())} /></TableHead>}
          <SortHead id="code" label="Short URL" sort={sort} onSort={onSort} />
          <SortHead id="target" label="Destination" sort={sort} onSort={onSort} className="hidden md:table-cell" />
          <SortHead id="clicks" label="Clicks" sort={sort} onSort={onSort} />
          {showOwner && <TableHead className="hidden lg:table-cell">Owner</TableHead>}
          <SortHead id="status" label="Status" sort={sort} onSort={onSort} />
          <SortHead id="created" label="Created" sort={sort} onSort={onSort} className="hidden sm:table-cell" />
          <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((l) => (
          <TableRow key={l.code} data-state={selected?.has(l.code) ? "selected" : undefined}>
            {selectable && <TableCell><Checkbox checked={selected!.has(l.code)} aria-label={`Select ${l.code}`} onCheckedChange={(v) => toggle(l.code, !!v)} /></TableCell>}
            <TableCell>
              <div className="flex items-center gap-1">
                <RouterLink to={showOwner ? `/admin/links?q=${l.code}` : `/links/${l.code}`} className="max-w-[180px] truncate font-medium hover:underline sm:max-w-[260px]">{l.shortUrl.replace(/^https?:\/\//, "")}</RouterLink>
                <CopyButton value={l.shortUrl} label="Copy" />
              </div>
            </TableCell>
            <TableCell className="hidden max-w-[280px] md:table-cell">
              <a href={l.targetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-muted-foreground hover:text-foreground">
                <span className="truncate">{l.targetUrl}</span><ExternalLink className="size-3 shrink-0" />
              </a>
            </TableCell>
            <TableCell className="tabular-nums">{formatNumber(l.clicks)}</TableCell>
            {showOwner && <TableCell className="hidden max-w-[180px] truncate text-muted-foreground lg:table-cell">{l.ownerEmail ?? "Anonymous"}</TableCell>}
            <TableCell><StatusBadge status={l.status} /></TableCell>
            <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatDate(l.createdAt)}</TableCell>
            <TableCell>{actions ? actions(l) : <LinkActions link={l} />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
