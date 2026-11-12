import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, QrCode, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { CopyButton } from "@/components/copy-button";
import { QrDialog } from "@/components/qr-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { useDebounce } from "@/components/use-debounce";
import { api, errorMessage } from "@/lib/api";
import type { Link as LinkT, Page } from "@/lib/types";

export default function QrCodes() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<LinkT | null>(null);
  const dq = useDebounce(search);
  const q = useQuery({ queryKey: ["links", "qr", dq, page], queryFn: () => api<Page<LinkT>>("/links", { query: { q: dq, page, perPage: 12 } }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="QR Codes" description="Every short link has a QR code. Preview and download it as SVG or PNG. Deleting the link removes its QR code." />
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search links" aria-label="Search links" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      {q.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-60" />)}</div>
        : q.isError ? <Card><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></Card>
        : q.data!.total === 0 ? <Card><EmptyState icon={QrCode} title={dq ? "No matching links" : "No QR codes yet"} description={dq ? "Try a different search." : "Create a short link and its QR code will appear here."} action={!dq && <Button asChild><Link to="/links/new">Create Short Link</Link></Button>} /></Card>
        : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
              {q.data!.items.map((l) => (
                <Card key={l.code} className="flex flex-col gap-3 p-4">
                  <button className="mx-auto w-full max-w-[160px] rounded-md border bg-white p-1" onClick={() => setOpen(l)} aria-label={`Preview QR code for ${l.code}`}>
                    <img loading="lazy" alt={`QR code for ${l.shortUrl}`} src={`/api/links/${encodeURIComponent(l.code)}/qr.svg`} className="w-full" />
                  </button>
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{l.shortUrl.replace(/^https?:\/\//, "")}</p><p className="truncate text-xs text-muted-foreground">{l.targetUrl}</p></div>
                  <div className="mt-auto flex items-center justify-between"><Button variant="outline" size="sm" onClick={() => setOpen(l)}><Eye />Preview</Button><CopyButton value={l.shortUrl} /></div>
                </Card>
              ))}
            </div>
            <Card><Pagination page={q.data!.page} perPage={q.data!.perPage} total={q.data!.total} onPage={setPage} /></Card>
          </>
        )}
      {open && <QrDialog link={open} open onOpenChange={(o) => !o && setOpen(null)} />}
    </>
  );
}
