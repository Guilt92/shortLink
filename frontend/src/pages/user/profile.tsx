import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";
import { useAuth } from "@/lib/auth";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { User } from "@/lib/types";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api<User>("/me", { method: "PATCH", body: { name } }),
    onSuccess: (u) => { setUser(u); toast.success("Profile updated"); },
    onError: (e) => setError(errorMessage(e)),
  });
  if (!user) return null;
  return (
    <>
      <PageHeader title="Profile" description="Your personal information." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Account</CardTitle><CardDescription>Member since {formatDate(user.createdAt)}</CardDescription></CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex items-center gap-3"><UserAvatar name={user.name} className="size-12" /><div><p className="font-medium">{user.name}</p><div className="mt-0.5"><StatusBadge status={user.role} /></div></div></div>
          <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return setError("Name is required"); setError(null); save.mutate(); }}>
            <Field id="name" label="Full name" error={error}><Input id="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} maxLength={100} /></Field>
            <Field id="email" label="Email" hint="Your email address can't be changed."><Input id="email" value={user.email} readOnly disabled /></Field>
            <div><Button type="submit" loading={save.isPending} disabled={name.trim() === user.name}>Save changes</Button></div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
