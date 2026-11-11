import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Field } from "@/components/field";
import { useAuth } from "@/lib/auth";
import { api, errorMessage } from "@/lib/api";
import type { Settings } from "@/lib/types";

export default function AdminSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === "super_admin";
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<Settings>("/admin/settings") });
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (body: Settings) => api<Settings>("/admin/settings", { method: "PUT", body }),
    onSuccess: (r) => { toast.success("Settings saved"); qc.setQueryData(["admin", "settings"], r); },
    onError: (e) => setError(errorMessage(e)),
  });
  const dirty = !!(s && q.data && JSON.stringify(s) !== JSON.stringify(q.data));
  const row = (id: string, label: string, desc: string, key: "allowRegistration" | "allowAnonymousLinks") => (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div><Label htmlFor={id}>{label}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
      <Switch id={id} checked={s![key]} disabled={!canEdit} onCheckedChange={(v) => setS({ ...s!, [key]: v })} />
    </div>
  );
  return (
    <>
      <PageHeader title="Settings" description="Platform policies. Every option here is enforced by the server." />
      {q.isError ? <Card><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></Card> : (
        <Card className="max-w-2xl">
          <CardHeader><CardTitle>General</CardTitle><CardDescription>{canEdit ? "Changes take effect immediately and are recorded in the audit log." : "Only super admins can change these settings."}</CardDescription></CardHeader>
          <CardContent>
            {!s ? <Skeleton className="h-40 w-full" /> : (
              <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); setError(null); if (!Number.isInteger(s.maxLinksPerUser) || s.maxLinksPerUser < 1) return setError("Max links per user must be a positive whole number"); save.mutate(s); }}>
                {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                {row("reg", "Allow new registrations", "When off, the register endpoint rejects new accounts.", "allowRegistration")}
                {row("anon", "Allow anonymous links", "When off, the public landing-page shortener (POST /create) is disabled.", "allowAnonymousLinks")}
                <Field id="max" label="Max links per user" hint="Enforced when a user creates a link.">
                  <Input id="max" type="number" min={1} className="max-w-40" value={s.maxLinksPerUser} disabled={!canEdit} onChange={(e) => setS({ ...s, maxLinksPerUser: Number(e.target.value) })} />
                </Field>
                {canEdit && <div><Button type="submit" loading={save.isPending} disabled={!dirty}>Save settings</Button></div>}
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
