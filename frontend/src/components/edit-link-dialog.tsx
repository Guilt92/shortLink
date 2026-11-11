import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { isValidHttpUrl } from "@/lib/utils";
import type { Link } from "@/lib/types";

export const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function EditLinkDialog({ link, open, onOpenChange, onSaved }: { link: Link; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [url, setUrl] = useState(link.targetUrl);
  const [expires, setExpires] = useState(toLocalInput(link.expiresAt));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api(`/links/${link.code}`, { method: "PATCH", body: { targetUrl: url.trim(), expiresAt: expires ? new Date(expires).toISOString() : null } }),
    onSuccess: () => { toast.success("Link updated"); onSaved(); onOpenChange(false); },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidHttpUrl(url)) return setError("Enter a valid http(s) URL");
    setError(null);
    save.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader><DialogTitle>Edit link</DialogTitle><DialogDescription>{link.shortUrl}</DialogDescription></DialogHeader>
          <div className="grid gap-2"><Label htmlFor="edit-url">Destination URL</Label><Input id="edit-url" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!error} /></div>
          <div className="grid gap-2">
            <Label htmlFor="edit-exp">Expiration (optional)</Label>
            <Input id="edit-exp" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={save.isPending}>Save changes</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
