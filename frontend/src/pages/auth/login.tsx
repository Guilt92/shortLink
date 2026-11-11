import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const user = await api<User>("/auth/login", { method: "POST", body: { email, password, remember } });
      setUser(user);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard", { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" description="Sign in to manage your short links." footer={<>Don't have an account? <Link to="/register" className="font-medium text-foreground underline underline-offset-4">Create one</Link></>}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {serverError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</div>}
        <Field id="email" label="Email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} disabled={busy} placeholder="you@example.com" />
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} disabled={busy} />
        </Field>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} /><Label htmlFor="remember" className="font-normal">Remember me</Label></div>
          <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">Forgot password?</Link>
        </div>
        <Button type="submit" loading={busy}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}
