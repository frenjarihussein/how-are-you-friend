import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useMe, moduleEnabled } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useApplyBrandColor, useBranding } from "@/lib/branding";
import { NotificationBell } from "@/components/NotificationBell";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import {
  BookOpen,
  Building2,
  ClipboardList,
  ClipboardCheck,
  Repeat,
  UserCheck,
  ShoppingCart,
  Boxes,
  Coins,
  Gauge,
  HardHat,
  LogOut,
  Package,
  Receipt,
  ScrollText,
  Truck,
  Users,
  Warehouse,
  Landmark,
  FileText,
  Settings,
  Languages,
  Bell,
  ScrollText as LedgerIcon,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Maximize,
  ArrowRight,
  Wallet,
  ShieldCheck,
} from "lucide-react";

export type NavGroup = { id: string; label: string; icon: typeof Gauge; items: string[] };

export const NAV_GROUPS: NavGroup[] = [
  { id: "sales", label: "المبيعات ونقاط البيع", icon: ShoppingCart, items: ["/pos", "/documents", "/partners"] },
  { id: "stock", label: "المستودعات والمواد", icon: Package, items: ["/products", "/warehouses", "/stock", "/stocktake", "/warehouse-desk"] },
  { id: "finance", label: "المالية والحسابات", icon: Wallet, items: ["/journal", "/recurring", "/cheques", "/accounts", "/assets", "/ledgers", "/reports"] },
  { id: "admin", label: "الإدارة والرواتب", icon: Settings, items: ["/payroll", "/projects", "/users", "/settings", "/audit"] },
  { id: "owner", label: "إدارة النظام", icon: ShieldCheck, items: ["/companies", "/subscriptions", "/notifications"] },
];

export const QUICK_ACTIONS = [
  { to: "/pos", label: "فاتورة بيع", desc: "بيع سريع عبر نقطة البيع", icon: ShoppingCart, module: "documents" },
  { to: "/documents", label: "فاتورة شراء", desc: "تسجيل مشتريات من مورد", icon: Truck, module: "documents" },
  { to: "/journal", label: "قيد يومية", desc: "قيد محاسبي يدوي", icon: ScrollText, module: "journal" },
  { to: "/documents", label: "سند قبض / دفع", desc: "تحصيل أو سداد نقدي", icon: Receipt, module: "documents" },
] as const;

export type NavItem = { to: string; label: string; icon: typeof Gauge; module?: string; superOnly?: boolean };

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "لوحة المؤشرات", icon: Gauge },
  { to: "/companies", label: "إدارة الشركات", icon: Building2, superOnly: true },
  { to: "/subscriptions", label: "الاشتراكات والمقبوضات", icon: Coins, superOnly: true },
  { to: "/notifications", label: "الإشعارات العامة", icon: Bell, superOnly: true },
  { to: "/accounts", label: "شجرة الحسابات", icon: BookOpen, module: "accounts" },
  { to: "/journal", label: "دفتر اليومية العامة", icon: ScrollText, module: "journal" },
  { to: "/documents", label: "المستندات والفواتير", icon: FileText, module: "documents" },
  { to: "/partners", label: "الزبائن والموردون", icon: Users, module: "partners" },
  { to: "/cheques", label: "الشيكات والبنوك", icon: Receipt, module: "cheques" },
  { to: "/assets", label: "الأصول الثابتة", icon: Landmark, module: "assets" },
  { to: "/products", label: "بطاقات المواد", icon: Package, module: "products" },
  { to: "/warehouses", label: "المستودعات", icon: Warehouse, module: "warehouses" },
  { to: "/stock", label: "حركات المخزون", icon: Truck, module: "stock" },
  { to: "/stocktake", label: "الجرد المخزني", icon: ClipboardCheck, module: "stock" },
  { to: "/pos", label: "نقطة البيع", icon: ShoppingCart, module: "documents" },
  { to: "/warehouse-desk", label: "عمليات المستودع السريعة", icon: Boxes, module: "stock" },
  { to: "/projects", label: "المشاريع والتعهدات", icon: HardHat, module: "projects" },
  { to: "/recurring", label: "القيود الدورية", icon: Repeat, module: "journal" },
  { to: "/payroll", label: "الموظفون والرواتب", icon: UserCheck, module: "payroll" },
  { to: "/reports", label: "التقارير المالية", icon: Coins, module: "reports" },
  { to: "/ledgers", label: "دفاتر الأستاذ والكشوف", icon: LedgerIcon, module: "reports" },
  { to: "/users", label: "المستخدمون والصلاحيات", icon: Users, module: "users" },
  { to: "/settings", label: "إعدادات الحساب", icon: Settings, module: "accounts" },
  { to: "/audit", label: "سجل حركات المستخدمين", icon: ClipboardList, module: "audit" },
];

const CASHIER_TABS: Record<string, { to: string; label: string }[]> = {
  sales_cashier: [{ to: "/pos", label: "شاشة البيع" }],
  purchase_cashier: [{ to: "/pos", label: "شاشة الشراء" }],
  warehouse_keeper: [
    { to: "/warehouse-desk", label: "عمليات المستودع" },
    { to: "/stocktake", label: "الجرد" },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const brand = useBranding();
  useApplyBrandColor(brand.data?.primary_color);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const superAllowed = ["/companies", "/subscriptions", "/notifications"];
  const kind = me?.accountKind ?? "standard";
  const cashierTabs = CASHIER_TABS[kind] ?? null;
  useEffect(() => {
    if (me?.isSuperAdmin && !superAllowed.some((p) => pathname.startsWith(p))) {
      navigate({ to: "/companies", replace: true });
    }
    if (cashierTabs && !cashierTabs.some((t) => pathname.startsWith(t.to))) {
      navigate({ to: cashierTabs[0]!.to, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.isSuperAdmin, pathname, kind]);

  if (me?.tenantLocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center">
          <p className="font-bold">{t("حساب الشركة مقفل")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("انتهى اشتراك الشركة أو تم إيقافه. يرجى التواصل مع مدير النظام لتجديد الاشتراك.")}
          </p>
          <button onClick={signOut} className="mt-4 rounded-md border px-4 py-2 text-sm">
            {t("تسجيل الخروج")}
          </button>
        </div>
      </div>
    );
  }

  if (!isLoading && me === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("لا يوجد حساب مرتبط بهذا الدخول. يرجى مراجعة مدير النظام لإنشاء حسابك.")}
          </p>
          <button
            onClick={signOut}
            className="mt-4 rounded-md border px-4 py-2 text-sm"
          >
            {t("تسجيل الخروج")}
          </button>
        </div>
      </div>
    );
  }

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("sb-collapsed") === "1");
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("sb-collapsed", c ? "0" : "1");
      return !c;
    });
  }
  const kiosk = pathname.startsWith("/pos") || pathname.startsWith("/warehouse-desk");
  function goFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const initials = (me?.fullName || me?.email || "?").trim().slice(0, 1).toUpperCase();
  const profileMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-label={t("الملف الشخصي")}>
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{me?.fullName || "—"}</div>
          <div className="truncate text-xs text-muted-foreground">{me?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
          <Languages className="size-4" />{lang === "ar" ? "English" : "العربية"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="text-destructive">
          <LogOut className="size-4" />{t("تسجيل الخروج")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (cashierTabs) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
          <span className="truncate font-semibold">{me?.tenantName ?? t("يوسف سوفت")}</span>
          <nav className="flex gap-1 rounded-lg bg-muted p-1">
            {cashierTabs.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition",
                  pathname.startsWith(tab.to) ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(tab.label)}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <button onClick={goFullscreen} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={t("ملء الشاشة")}><Maximize className="size-5" /></button>
            <NotificationBell />
            {profileMenu}
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 p-3">{children}</main>
      </div>
    );
  }

  if (kiosk) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <header className="no-print flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
          <Link to="/dashboard" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowRight className="size-4 ltr:rotate-180" />{t("رجوع")}
          </Link>
          <span className="truncate text-sm font-semibold">{me?.tenantName}</span>
          <div className="ms-auto flex items-center gap-1">
            <button onClick={goFullscreen} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={t("ملء الشاشة")}><Maximize className="size-4" /></button>
            <NotificationBell />
            {profileMenu}
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 p-3">{children}</main>
      </div>
    );
  }

  const items = NAV.filter((n) => {
    if (me?.isSuperAdmin) return !!n.superOnly;
    if (n.superOnly) return false;
    if (!n.module) return true;
    return moduleEnabled(me, n.module);
  });
  const byTo = Object.fromEntries(items.map((i) => [i.to, i]));
  const groups = NAV_GROUPS.map((g) => ({ ...g, list: g.items.map((to) => byTo[to]).filter(Boolean) as NavItem[] })).filter((g) => g.list.length);
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const quick = QUICK_ACTIONS.filter((a) => !me?.isSuperAdmin && moduleEnabled(me, a.module));

  const navLink = (item: NavItem) => (
    <Link
      key={item.to}
      to={item.to}
      title={collapsed ? t(item.label) : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
        collapsed && "justify-center px-0",
        isActive(item.to)
          ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-soft ring-1 ring-sidebar-border"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className={cn("size-4 shrink-0", isActive(item.to) ? "text-highlight" : "opacity-70")} />
      {!collapsed && <span className="truncate">{t(item.label)}</span>}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "no-print sticky top-0 hidden h-screen shrink-0 flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
          {brand.data?.logo_url ? (
            <img src={brand.data.logo_url} alt="" className="size-7 shrink-0 rounded-md border bg-card object-contain p-0.5" />
          ) : (
            <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">ي</div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{t("يوسف سوفت")}</div>
              <div className="truncate text-[11px] text-muted-foreground">{me?.isSuperAdmin ? t("مالك النظام") : (me?.tenantName ?? "—")}</div>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-2">
          {byTo["/dashboard"] && <div>{navLink(byTo["/dashboard"])}</div>}
          {groups.map((g) =>
            collapsed ? (
              <div key={g.id} className="space-y-0.5 border-t border-sidebar-border pt-3">{g.list.map(navLink)}</div>
            ) : (
              <Collapsible key={g.id} defaultOpen>
                <CollapsibleTrigger className="group/c flex w-full items-center gap-2 px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                  <g.icon className="size-3.5" />
                  <span className="truncate">{t(g.label)}</span>
                  <ChevronDown className="ms-auto size-3.5 transition-transform group-data-[state=closed]/c:-rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5">{g.list.map(navLink)}</CollapsibleContent>
              </Collapsible>
            ),
          )}
        </nav>
        <div className="border-t border-sidebar-border p-2.5">
          <button
            onClick={toggleCollapsed}
            className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground", collapsed && "justify-center px-0")}
          >
            {collapsed ? <PanelRightOpen className="size-4 ltr:rotate-180" /> : <PanelRightClose className="size-4 ltr:rotate-180" />}
            {!collapsed && t("طي القائمة")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <span className="font-semibold md:hidden">{t("يوسف سوفت")}</span>
          <div className="hidden min-w-0 flex-1 md:block"><GlobalSearch nav={items} /></div>
          <div className="ms-auto flex shrink-0 items-center gap-1.5">
            {quick.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90">
                    <Plus className="size-4" /><span className="hidden sm:inline">{t("عملية جديدة")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-1.5">
                  {quick.map((a) => (
                    <DropdownMenuItem key={a.label} onClick={() => navigate({ to: a.to })} className="gap-3 py-2">
                      <span className="grid size-8 place-items-center rounded-md border bg-muted"><a.icon className="size-4" /></span>
                      <span className="min-w-0"><span className="block text-sm font-medium">{t(a.label)}</span><span className="block text-xs text-muted-foreground">{t(a.desc)}</span></span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!me?.isSuperAdmin && me?.tenantName && (
              <span className="hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
                <Building2 className="size-3.5" /><span className="max-w-40 truncate">{me.tenantName}</span>
              </span>
            )}
            <NotificationBell />
            {profileMenu}
          </div>
        </header>
        <div className="no-print overflow-x-auto border-b px-3 py-2 md:hidden">
          <div className="flex gap-1.5">
            {items.map((item) => (
              <Link key={item.to} to={item.to} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs", isActive(item.to) && "bg-primary text-primary-foreground")}>
                {t(item.label)}
              </Link>
            ))}
          </div>
        </div>
        <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 p-4 md:p-8">{children}</main>
        {me?.isTenantAdmin && me.tenantId && <OnboardingWizard tenantId={me.tenantId} tenantName={me.tenantName ?? ""} />}
      </div>
    </div>
  );
}
