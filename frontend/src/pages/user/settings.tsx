import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { PasswordStrength } from "@/components/password-strength";
import { api, errorMessage } from "@/lib/api";

export default function UserSettings() {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const change = useMutation({
    mutationFn: () => api("/me/password", { method: "POST", body: { currentPassword: f.current, newPassword: f.next } }),
    onSuccess: () => { toast.success("Password changed. Other devices were signed out."); setF({ current: "", next: "", confirm: "" }); },
    onError: (e) => setErrors({ form: errorMessage(e) }),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.current) errs.current = "Enter your current password";
    if (f.next.length < 8 || !/[A-Za-z]/.test(f.next) || !/\d/.test(f.next)) errs.next = "Use at least 8 characters with a letter and a digit";
    if (f.confirm !== f.next) errs.confirm = "Passwords do not match";
    setErrors(errs);
    if (!Object.keys(errs).length) change.mutate();
  };
  return (
    <>
      <PageHeader title="Settings" description="Security settings for your account." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Change password</CardTitle><CardDescription>Changing your password signs you out of all other devices.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            {errors.form && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors.form}</div>}
            <Field id="current" label="Current password" error={errors.current}><PasswordInput id="current" autoComplete="current-password" value={f.current} onChange={set("current")} aria-invalid={!!errors.current} /></Field>
            <Field id="next" label="New password" error={errors.next}><PasswordInput id="next" autoComplete="new-password" value={f.next} onChange={set("next")} aria-invalid={!!errors.next} /><PasswordStrength password={f.next} /></Field>
            <Field id="confirm" label="Confirm new password" error={errors.confirm}><PasswordInput id="confirm" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} aria-invalid={!!errors.confirm} /></Field>
            <div><Button type="submit" loading={change.isPending}>Update password</Button></div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
