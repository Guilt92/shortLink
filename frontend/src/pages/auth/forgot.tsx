import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/auth-layout";
import { Field } from "@/components/field";
import { api, errorMessage } from "@/lib/api";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address");
    setError(null);
    setBusy(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Forgot password" description="We'll email you a link to reset it." footer={<Link to="/login" className="font-medium text-foreground underline underline-offset-4">Back to sign in</Link>}>
      {sent ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center" role="status">
          <MailCheck className="size-8 text-success" />
          <p className="text-sm">If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way. The link expires in 1 hour.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="email" label="Email" error={error}><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} disabled={busy} /></Field>
          <Button type="submit" loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
