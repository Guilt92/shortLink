import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/copy-button";
import { ErrorState } from "@/components/states";
import type { Link } from "@/lib/types";

async function fetchSvg(code: string) {
  const res = await fetch(`/api/links/${encodeURIComponent(code)}/qr.svg`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Could not load the QR code");
  return res.text();
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("render failed")); img.src = url; });
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

export function QrDialog({ link, open, onOpenChange }: { link: Link; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({ queryKey: ["qr", link.code], queryFn: () => fetchSvg(link.code), enabled: open, staleTime: Infinity });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>QR code</DialogTitle><DialogDescription className="break-all">{link.shortUrl}</DialogDescription></DialogHeader>
        <div className="mx-auto w-56 overflow-hidden rounded-md border bg-white p-1">
          {q.isLoading ? <Skeleton className="aspect-square w-full" />
            : q.isError ? <ErrorState message="Could not load the QR code." onRetry={() => void q.refetch()} />
            : <img alt={`QR code for ${link.shortUrl}`} className="w-full" src={`data:image/svg+xml;utf8,${encodeURIComponent(q.data ?? "")}`} />}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" disabled={!q.data} onClick={() => q.data && download(`${link.code}-qr.svg`, new Blob([q.data], { type: "image/svg+xml" }))}><Download />SVG</Button>
          <Button variant="outline" size="sm" disabled={!q.data} onClick={async () => q.data && download(`${link.code}-qr.png`, await svgToPng(q.data))}><Download />PNG</Button>
          <CopyButton value={link.shortUrl} label="Copy URL" size="sm" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
