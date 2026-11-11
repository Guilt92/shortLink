import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ExternalLink, MoreHorizontal, Pencil, Power, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QrDialog } from "@/components/qr-dialog";
import { EditLinkDialog } from "@/components/edit-link-dialog";
import { api, errorMessage } from "@/lib/api";
import type { Link } from "@/lib/types";

export function LinkActions({ link }: { link: Link }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [del, setDel] = useState(false);
  const [edit, setEdit] = useState(false);
  const [qr, setQr] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["links"] }); void qc.invalidateQueries({ queryKey: ["overview"] }); void qc.invalidateQueries({ queryKey: ["link", link.code] }); };
  const remove = useMutation({
    mutationFn: () => api(`/links/${link.code}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Link deleted"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = useMutation({
    mutationFn: () => api(`/links/${link.code}`, { method: "PATCH", body: { isActive: !link.isActive } }),
    onSuccess: () => { toast.success(link.isActive ? "Link disabled" : "Link enabled"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${link.code}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => window.open(link.shortUrl, "_blank", "noopener,noreferrer")}><ExternalLink />Open short URL</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.open(link.targetUrl, "_blank", "noopener,noreferrer")}><ExternalLink />Open destination</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => nav(`/links/${link.code}`)}><BarChart3 />View analytics</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setQr(true)}><QrCode />QR code</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEdit(true)}><Pencil />Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggle.mutate()}><Power />{link.isActive ? "Disable" : "Enable"}</DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={() => setDel(true)}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={del} onOpenChange={setDel} destructive title="Delete this link?" confirmLabel="Delete"
        description={<>The short URL <span className="font-medium text-foreground">{link.shortUrl}</span> will stop working and its analytics will be permanently removed.</>}
        onConfirm={() => remove.mutate()} />
      {edit && <EditLinkDialog link={link} open={edit} onOpenChange={setEdit} onSaved={refresh} />}
      {qr && <QrDialog link={link} open={qr} onOpenChange={setQr} />}
    </>
  );
}
