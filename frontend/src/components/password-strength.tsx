import { cn, passwordStrength } from "@/lib/utils";

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  const colors = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"];
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={cn("h-1 flex-1 rounded-full bg-muted", i < Math.max(score, 1) && colors[score])} />)}</div>
      <p className="text-xs text-muted-foreground">Strength: {label}</p>
    </div>
  );
}
