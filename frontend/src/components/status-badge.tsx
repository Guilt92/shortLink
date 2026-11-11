import { Badge } from "@/components/ui/badge";

const map: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "warning" },
  disabled: { label: "Disabled", variant: "secondary" },
  suspended: { label: "Suspended", variant: "destructive" },
  pending: { label: "Pending", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
  rejected: { label: "Rejected", variant: "secondary" },
  verified: { label: "Verified", variant: "success" },
  unverified: { label: "Not verified", variant: "warning" },
  user: { label: "User", variant: "outline" },
  admin: { label: "Admin", variant: "secondary" },
  super_admin: { label: "Super admin", variant: "success" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
