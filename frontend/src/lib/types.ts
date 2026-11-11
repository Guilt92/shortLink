export type Role = "user" | "admin" | "super_admin";
export interface User { id: number; email: string; name: string; role: Role; createdAt: string }
export type LinkStatus = "active" | "expired" | "disabled";
export interface Link {
  code: string; shortUrl: string; targetUrl: string; clicks: number; status: LinkStatus;
  isActive: boolean; disabledByAdmin: boolean; expiresAt: string | null; createdAt: string;
  domain: string | null; ownerId: number | null; ownerEmail: string | null;
}
export interface Page<T> { items: T[]; total: number; page: number; perPage: number }
export interface Point { bucket: string; clicks: number; visitors: number }
export interface NameCount { name: string; count: number }
export interface Domain {
  id: number; hostname: string; verified: boolean; verifiedAt: string | null; createdAt: string;
  ownerEmail: string | null; linkCount: number;
  dns: { txt: { type: string; name: string; value: string }; route: { type: string; name: string; value: string; note: string } };
}
export interface Breakdowns { referrers: NameCount[]; devices: NameCount[]; browsers: NameCount[]; operatingSystems: NameCount[] }
export interface Analytics extends Breakdowns {
  days: number; clicks: number; previousClicks: number; uniqueVisitors: number; series: Point[];
  topLinks: { code: string; targetUrl: string; clicks: number }[];
}
export interface LinkStats extends Breakdowns { days: number; clicks: number; uniqueVisitors: number; series: Point[] }
export interface Overview {
  days: number; totalLinks: number; activeLinks: number; clicks: number; previousClicks: number;
  uniqueVisitors: number; previousUniqueVisitors: number; series: Point[]; recentLinks: Link[];
}
export interface AdminUserRow {
  id: number; email: string; name: string; role: Role; status: "active" | "suspended";
  createdAt: string; lastLoginAt: string | null; linkCount: number;
}
export interface AdminOverview {
  days: number;
  totals: { users: number; activeUsers: number; links: number; activeLinks: number; clicks: number; pendingReports: number };
  registrations: { bucket: string; count: number }[];
  linkCreations: { bucket: string; count: number }[];
  clickSeries: Point[];
  usage: { topUsers: NameCount[]; anonymousLinks: number };
  recentActivity: { kind: "user" | "link" | "report" | "audit"; label: string; at: string }[];
}
export interface Report {
  id: number; linkId: string | null; reportedUrl: string; reporter: string | null; reason: string; details: string | null;
  status: "pending" | "resolved" | "rejected"; assignedTo: number | null; assignedEmail: string | null;
  createdAt: string; resolvedAt: string | null; linkStatus: LinkStatus | null; targetUrl: string | null;
}
export interface AuditEntry {
  id: number; actorId: number | null; actorEmail: string | null; action: string; targetType: string | null;
  targetId: string | null; details: unknown; createdAt: string;
}
export interface Settings { allowRegistration: boolean; allowAnonymousLinks: boolean; maxLinksPerUser: number }
