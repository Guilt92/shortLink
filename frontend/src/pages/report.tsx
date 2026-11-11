import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AuthLayout } from "@/components/auth-layout";
import { Field } from "@/components/field";
import { api, errorMessage } from "@/lib/api";
import { isValidHttpUrl } from "@/lib/utils";

export default function Report() {
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("phishing");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidHttpUrl(url)) return setError("Enter the full short URL, including https://");
    setError(null);
    setBusy(true);
    try {
      await api("/reports", { method: "POST", body: { url, reason, details: details || undefined, reporter: email || undefined } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Report a link" description="Tell us about a short link that is abusive." footer={<Link to="/login" className="font-medium text-foreground underline underline-offset-4">Back to ShortLink</Link>}>
      {done ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center" role="status"><CheckCircle2 className="size-8 text-success" /><p className="text-sm">Thanks. Our team will review your report.</p></div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          <Field id="url" label="Short URL"><Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/abc1234" disabled={busy} /></Field>
          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phishing">Phishing</SelectItem><SelectItem value="malware">Malware</SelectItem><SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="illegal">Illegal content</SelectItem><SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field id="details" label="Details (optional)"><textarea id="details" value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></Field>
          <Field id="reporter" label="Your email (optional)"><Input id="reporter" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></Field>
          <Button type="submit" loading={busy}>Submit report</Button>
        </form>
      )}
    </AuthLayout>
  );
}
