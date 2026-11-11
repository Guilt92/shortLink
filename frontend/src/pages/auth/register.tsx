import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { PasswordStrength } from "@/components/password-strength";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function Register() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Full name is required";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) errs.email = "Enter a valid email address";
    if (f.password.length < 8) errs.password = "Use at least 8 characters";
    else if (!/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) errs.password = "Include at least one letter and one digit";
    if (f.confirm !== f.password) errs.confirm = "Passwords do not match";
    if (!terms) errs.terms = "You must accept the terms to continue";
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      setUser(await api<User>("/auth/register", { method: "POST", body: { name: f.name, email: f.email, password: f.password } }));
      nav("/dashboard", { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Create your account" description="Start shortening and tracking links." footer={<>Already have an account? <Link to="/login" className="font-medium text-foreground underline underline-offset-4">Sign in</Link></>}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {serverError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</div>}
        <Field id="name" label="Full name" error={errors.name}><Input id="name" autoComplete="name" value={f.name} onChange={set("name")} aria-invalid={!!errors.name} disabled={busy} /></Field>
        <Field id="email" label="Email" error={errors.email}><Input id="email" type="email" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={!!errors.email} disabled={busy} /></Field>
        <Field id="password" label="Password" error={errors.password}>
          <PasswordInput id="password" autoComplete="new-password" value={f.password} onChange={set("password")} aria-invalid={!!errors.password} disabled={busy} />
          <PasswordStrength password={f.password} />
        </Field>
        <Field id="confirm" label="Confirm password" error={errors.confirm}><PasswordInput id="confirm" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} aria-invalid={!!errors.confirm} disabled={busy} /></Field>
        <div className="grid gap-1.5">
          <div className="flex items-start gap-2">
            <Checkbox id="terms" className="mt-0.5" checked={terms} onCheckedChange={(v) => setTerms(!!v)} />
            <Label htmlFor="terms" className="font-normal leading-snug">I accept the Terms of Service and Privacy Policy</Label>
          </div>
          {errors.terms && <p role="alert" className="text-xs text-destructive">{errors.terms}</p>}
        </div>
        <Button type="submit" loading={busy}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
