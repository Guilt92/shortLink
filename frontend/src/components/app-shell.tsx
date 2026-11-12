import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, ChevronsUpDown, CreditCard, Flag, Globe, History, LayoutDashboard, Link2, LogOut, Menu, Moon,
  PanelLeft, PlusCircle, QrCode, Settings, Shield, ShieldCheck, Sun, User as UserIcon, Users,
} from "lucide-react";
import { Dialog, SheetContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const userNav: NavGroup[] = [
  { title: "Main", items: [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/links", label: "My Links", icon: Link2, end: true },
    { to: "/links/new", label: "Create Short Link", icon: PlusCircle },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
  ] },
  { title: "Management", items: [
    { to: "/qr-codes", label: "QR Codes", icon: QrCode },
    { to: "/domains", label: "Custom Domains", icon: Globe },
  ] },
  { title: "Account", items: [
    { to: "/profile", label: "Profile", icon: UserIcon },
    { to: "/settings", label: "Settings", icon: Settings },
  ] },
];

const adminNav: NavGroup[] = [
  { title: "Overview", items: [{ to: "/admin", label: "Admin Overview", icon: LayoutDashboard, end: true }] },
  { title: "Management", items: [
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/links", label: "All Links", icon: Link2 },
    { to: "/admin/domains", label: "Custom Domains", icon: Globe },
  ] },
  { title: "Monitoring", items: [
    { to: "/admin/analytics", label: "Platform Analytics", icon: BarChart3 },
    { to: "/admin/reports", label: "Abuse Reports", icon: Flag },
    { to: "/admin/audit", label: "Audit Logs", icon: History },
  ] },
  { title: "Configuration", items: [{ to: "/admin/settings", label: "Settings", icon: ShieldCheck }] },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* storage unavailable */ }
  };
  return { dark, toggle };
}

function SidebarNav({ groups, collapsed, onNavigate }: { groups: NavGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-3" aria-label="Main navigation">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1">
          {!collapsed && <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{g.title}</p>}
          {g.items.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed && "justify-center", isActive && "bg-accent text-accent-foreground")}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
            return collapsed ? (
              <Tooltip key={item.to}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip>
            ) : link;
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed, admin }: { collapsed: boolean; admin: boolean }) {
  return (
    <Link to={admin ? "/admin" : "/dashboard"} className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Link2 className="size-4" /></span>
      {!collapsed && <span className="truncate">ShortLink{admin && <span className="ml-1.5 text-xs font-normal text-muted-foreground">Admin</span>}</span>}
    </Link>
  );
}

function crumbs(pathname: string, groups: NavGroup[], admin: boolean) {
  const flat = groups.flatMap((g) => g.items);
  const match = [...flat].sort((a, b) => b.to.length - a.to.length).find((i) => pathname === i.to || pathname.startsWith(i.to + "/"));
  const out: { label: string; to?: string }[] = [{ label: admin ? "Admin" : "Dashboard", to: admin ? "/admin" : "/dashboard" }];
  if (match && match.to !== "/admin" && match.to !== "/dashboard") out.push({ label: match.label, to: match.to });
  const rest = match ? pathname.slice(match.to.length).split("/").filter(Boolean) : [];
  if (rest.length && match?.to !== "/links/new") out.push({ label: decodeURIComponent(rest[0]) });
  out[out.length - 1].to = undefined;
  return out;
}

function UserMenu({ side, collapsed, iconOnly, admin }: { side: "top" | "bottom"; collapsed: boolean; iconOnly?: boolean; admin: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return null;
  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const c = collapsed;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn("flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", c && "justify-center")} aria-label="Account menu">
          <UserAvatar name={user.name} />
          {!c && !iconOnly && (<>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.name}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </>)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => nav("/profile")}><UserIcon />Profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => nav("/settings")}><Settings />Settings</DropdownMenuItem>
        {isAdmin && <DropdownMenuItem onSelect={() => nav(admin ? "/dashboard" : "/admin")}><Shield />{admin ? "User dashboard" : "Admin dashboard"}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={async () => { await logout(); nav("/login"); }}><LogOut />Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  const { dark, toggle } = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const groups = admin ? adminNav : userNav;
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("sidebar") === "collapsed"; } catch { return false; } });
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => { try { localStorage.setItem("sidebar", collapsed ? "collapsed" : "open"); } catch { /* ignore */ } }, [collapsed]);

  if (!user) return null;
  const trail = crumbs(pathname, groups, admin);
  const isAdmin = user.role === "admin" || user.role === "super_admin";

  return (
    <TooltipProvider delayDuration={150}>
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }} className="sr-only z-[60] rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:ring-2 focus:ring-ring">Skip to content</a>
      <div className="flex min-h-screen">
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 md:flex", collapsed ? "w-14" : "w-60")}>
          <Brand collapsed={collapsed} admin={admin} />
          <SidebarNav groups={groups} collapsed={collapsed} />
          <div className="border-t p-2">
            <UserMenu side="top" collapsed={collapsed} admin={admin} />
          </div>
        </aside>

        <Dialog open={drawer} onOpenChange={setDrawer}>
          <SheetContent aria-describedby={undefined}>
            <DialogTitle className="sr-only">Navigation</DialogTitle>
            <DialogDescription className="sr-only">Site navigation</DialogDescription>
            <div className="flex h-full flex-col">
              <Brand collapsed={false} admin={admin} />
              <SidebarNav groups={groups} collapsed={false} onNavigate={() => setDrawer(false)} />
              <div className="border-t p-2"><UserMenu side="top" collapsed={false} admin={admin} /></div>
            </div>
          </SheetContent>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu /></Button>
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><PanelLeft /></Button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
              {trail.map((c, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground">/</span>}
                  {c.to ? <Link to={c.to} className="text-muted-foreground hover:text-foreground">{c.label}</Link> : <span className="truncate font-medium" aria-current="page">{c.label}</span>}
                </span>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              {isAdmin && (
                <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => nav(admin ? "/dashboard" : "/admin")}>
                  {admin ? <><CreditCard />User dashboard</> : <><Shield />Admin</>}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">{dark ? <Sun /> : <Moon />}</Button>
              <div className="md:hidden"><UserMenu side="bottom" collapsed iconOnly admin={admin} /></div>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 outline-none md:p-6"><Outlet /></main>
        </div>
      </div>
    </TooltipProvider>
  );

}
