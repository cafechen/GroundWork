"use client";
// Adapted from satnaing/shadcn-admin app-sidebar/header/nav-group/main.
// MIT, Copyright (c) 2024 Sat Naing; licenses/shadcn-admin-MIT.txt.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Boxes,
  ChevronRight,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  Map,
  Moon,
  Network,
  Sun,
  Warehouse,
  ShieldCheck,
} from "lucide-react";
import { useLocale } from "./providers";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";

const menus = [
  { href: "/", zh: "总览", en: "Overview", icon: LayoutDashboard },
  { href: "/maps", zh: "地图管理", en: "Maps", icon: Map },
  { href: "/models", zh: "设备模型", en: "Device models", icon: Boxes },
  { href: "/gateways", zh: "接入网关", en: "Gateways", icon: Network },
  { href: "/parks", zh: "园区管理", en: "Parks", icon: Warehouse },
];
function AppSidebar() {
  const { t } = useLocale(),
    pathname = usePathname(),
    { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-16 justify-center border-b px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="gap-3 hover:bg-transparent"
            >
              <Link
                href="/"
                data-navigation
                onClick={() => setOpenMobile(false)}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Layers3 className="size-5" />
                </span>
                <span className="grid text-left leading-tight">
                  <span className="text-base font-semibold tracking-tight">
                    GroundWork
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("园区研发平台", "Park engineering")}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupLabel>{t("工作空间", "Workspace")}</SidebarGroupLabel>
          <nav aria-label={t("主菜单", "Main menu")}>
            <SidebarMenu>
              {menus.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={t(item.zh, item.en)}
                    isActive={
                      pathname === item.href ||
                      (item.href !== "/" &&
                        pathname.startsWith(item.href + "/"))
                    }
                    className="h-10"
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpenMobile(false)}
                      aria-current={
                        pathname === item.href ||
                        (item.href !== "/" &&
                          pathname.startsWith(item.href + "/"))
                          ? "page"
                          : undefined
                      }
                    >
                      <item.icon />
                      <span>{t(item.zh, item.en)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("研发工具", "Engineering")}</SidebarGroupLabel>
          <nav aria-label={t("辅助导航", "Engineering navigation")}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={t("独立实验室", "Laboratory")}
                  isActive={
                    pathname === "/workbench" || pathname === "/classic"
                  }
                  className="h-10"
                >
                  <Link href="/workbench" onClick={() => setOpenMobile(false)}>
                    <FlaskConical />
                    <span>{t("独立实验室", "Laboratory")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg p-1 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <ShieldCheck className="size-4" />
          </div>
          <div className="min-w-0 text-xs group-data-[collapsible=icon]:hidden">
            <p className="font-medium">{t("本地工作区", "Local workspace")}</p>
            <p className="mt-1 text-muted-foreground">
              {t("可信局域网预览", "Trusted-LAN preview")}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
export function AppearanceControls() {
  const { t, toggle } = useLocale(),
    { theme, toggleTheme } = useTheme();
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label={t(
          theme === "light" ? "切换深色模式" : "切换浅色模式",
          theme === "light" ? "Switch to dark mode" : "Switch to light mode",
        )}
        title={t("切换主题", "Toggle theme")}
      >
        {theme === "light" ? <Moon /> : <Sun />}
      </Button>
      <Button variant="ghost" size="sm" onClick={toggle}>
        {t("EN", "中文")}
      </Button>
    </>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    { t } = useLocale();
  if (pathname === "/login") return <>{children}</>;
  const current = menus.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/" && pathname.startsWith(item.href + "/")),
  );
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("跳到内容", "Skip to content")}
      </a>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm md:px-6">
          <SidebarTrigger
            aria-label={t("切换侧栏", "Toggle sidebar")}
            className="size-8"
          />
          <Separator orientation="vertical" className="!h-5" />
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {t("工作空间", "Workspace")}
            </span>
            <ChevronRight className="hidden size-3.5 text-muted-foreground sm:block" />
            <span className="truncate font-medium">
              {current
                ? t(current.zh, current.en)
                : t("独立实验室", "Laboratory")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-3 hidden items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground lg:inline-flex">
              <Box className="size-3.5" />
              {t("仿真预览", "Simulation preview")}
            </span>
            <AppearanceControls />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="@container/content min-w-0 flex-1 px-4 py-6 outline-none md:px-6 lg:px-8"
        >
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-2 border-t px-6 py-3 text-xs text-muted-foreground">
          <span>GroundWork · Ground</span>
          <span>
            {t(
              "仿真证据不代表实车安全认证",
              "Simulation evidence is not real-vehicle safety certification",
            )}
          </span>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
