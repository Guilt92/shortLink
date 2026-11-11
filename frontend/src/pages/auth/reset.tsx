import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth-layout";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { PasswordStrength } from "@/components/password-strength";
import { api, errorMessage } from "@/lib/api";

export default function Reset() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errs.password = "Use at least 8 characters with a letter and a digit";
    if (confirm !== password) errs.confirm = "Passwords do not match";
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success("Password updated. Please sign in.");
      nav("/login", { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return <AuthLayout title="Invalid link" description="This password reset link is missing its token." footer={<Link to="/forgot-password" className="font-medium text-foreground underline underline-offset-4">Request a new link</Link>}><span /></AuthLayout>;
  }
  return (
    <AuthLayout title="Reset password" description="Choose a new password for your account.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {serverError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError} <Link to="/forgot-password" className="underline">Request a new link</Link></div>}
        <Field id="password" label="New password" error={errors.password}>
          <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} disabled={busy} />
          <PasswordStrength password={password} />
        </Field>
        <Field id="confirm" label="Confirm password" error={errors.confirm}><PasswordInput id="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} disabled={busy} /></Field>
        <Button type="submit" loading={busy}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
