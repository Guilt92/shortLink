import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, ExternalLink, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { Field } from "@/components/field";
import { CopyButton } from "@/components/copy-button";
import { QrDialog } from "@/components/qr-dialog";
import { api, errorMessage } from "@/lib/api";
import { isValidHttpUrl } from "@/lib/utils";
import type { Domain, Link as LinkT } from "@/lib/types";

export default function CreateLink() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [domainId, setDomainId] = useState("none");
  const [expires, setExpires] = useState("");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<{ url?: string; alias?: string; expires?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<LinkT | null>(null);
  const [qr, setQr] = useState(false);
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api<Domain[]>("/domains") });
  const verified = (domains.data ?? []).filter((d) => d.verified);

  const create = useMutation({
    mutationFn: () => api<LinkT>("/links", { method: "POST", body: {
      targetUrl: url.trim(), alias: alias.trim() || undefined, domainId: domainId === "none" ? undefined : Number(domainId),
      expiresAt: expires ? new Date(expires).toISOString() : undefined, isActive: active,
    } }),
    onSuccess: (l) => { setCreated(l); void qc.invalidateQueries({ queryKey: ["links"] }); void qc.invalidateQueries({ queryKey: ["overview"] }); },
    onError: (e) => setServerError(errorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    const errs: typeof errors = {};
    if (!isValidHttpUrl(url)) errs.url = "Enter a valid URL starting with http:// or https://";
    if (alias && !/^[A-Za-z0-9_-]{3,32}$/.test(alias)) errs.alias = "3–32 characters: letters, digits, '-' or '_'";
    if (expires && new Date(expires).getTime() <= Date.now()) errs.expires = "Expiration must be in the future";
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    create.mutate();
  };

  const reset = () => { setCreated(null); setUrl(""); setAlias(""); setExpires(""); setDomainId("none"); setActive(true); setServerError(null); };

  if (created) {
    return (
      <>
        <PageHeader title="Create Short Link" description="Your link is ready to share." />
        <Card className="max-w-2xl">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-2 text-success"><CheckCircle2 className="size-5" /><span className="font-medium">Short link created</span></div>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
              <a href={created.shortUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium hover:underline">{created.shortUrl}</a>
              <CopyButton value={created.shortUrl} label="Copy" size="sm" />
            </div>
            <p className="break-all text-sm text-muted-foreground">Redirects to {created.targetUrl}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.open(created.shortUrl, "_blank", "noopener,noreferrer")}><ExternalLink />Open link</Button>
              <Button variant="outline" onClick={() => setQr(true)}><QrCode />QR code</Button>
              <Button variant="outline" asChild><Link to={`/links/${created.code}`}><BarChart3 />View details</Link></Button>
              <Button onClick={reset}>Create another</Button>
            </div>
          </CardContent>
        </Card>
        {qr && <QrDialog link={created} open={qr} onOpenChange={setQr} />}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Create Short Link" description="Paste a destination URL and customise how the link behaves." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Link details</CardTitle><CardDescription>Only the destination is required.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-5" noValidate>
            {serverError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</div>}
            <Field id="url" label="Destination URL" error={errors.url}>
              <Input id="url" type="url" inputMode="url" placeholder="https://example.com/a/long/url" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!errors.url} aria-describedby={errors.url ? "url-error" : undefined} disabled={create.isPending} autoFocus />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="alias" label="Custom alias (optional)" error={errors.alias} hint="Leave blank to generate a random code.">
                <Input id="alias" placeholder="my-campaign" value={alias} onChange={(e) => setAlias(e.target.value)} aria-invalid={!!errors.alias} disabled={create.isPending} />
              </Field>
              <div className="grid gap-1.5 content-start">
                <Label htmlFor="domain">Domain</Label>
                <Select value={domainId} onValueChange={setDomainId} disabled={create.isPending}>
                  <SelectTrigger id="domain"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default domain</SelectItem>
                    {verified.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.hostname}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{verified.length ? "Only verified domains are listed." : <>No verified custom domains. <Link to="/domains" className="underline">Add one</Link>.</>}</p>
              </div>
            </div>
            <Field id="expires" label="Expiration (optional)" error={errors.expires} hint="After this time the link stops redirecting.">
              <Input id="expires" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} aria-invalid={!!errors.expires} disabled={create.isPending} />
            </Field>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div><Label htmlFor="active">Active</Label><p className="text-xs text-muted-foreground">Inactive links return “gone” until you enable them.</p></div>
              <Switch id="active" checked={active} onCheckedChange={setActive} disabled={create.isPending} />
            </div>
            <div className="flex gap-2"><Button type="submit" loading={create.isPending}>Create link</Button><Button type="button" variant="outline" asChild><Link to="/links">Cancel</Link></Button></div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
