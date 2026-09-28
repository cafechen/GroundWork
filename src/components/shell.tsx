"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./providers";
import { Button } from "./ui/button";
const menus = [
  ["/", "总览", "Overview"],
  ["/maps", "地图管理", "Maps"],
  ["/models", "设备模型", "Device models"],
  ["/gateways", "接入网关", "Gateways"],
  ["/parks", "园区管理", "Parks"],
];
export function Shell({ children }: { children: React.ReactNode }) {
  const { t, toggle } = useLocale(),
    path = usePathname();
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
        <Link href="/" className="font-bold tracking-[.2em]">
          GROUND
          <span className="ml-2 text-xs font-normal tracking-normal">
            / {t("园区研发平台", "Park engineering")}
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/workbench" className="text-sm underline">
            {t("独立实验室", "Laboratory")}
          </Link>
          <span className="text-xs text-muted-foreground">
            {t(
              "可信局域网 · 单用户 · 无登录",
              "Trusted LAN · Single user · No login",
            )}
          </span>
          <Button variant="outline" onClick={toggle}>
            {t("EN", "中文")}
          </Button>
        </div>
      </header>
      <div className="flex flex-col md:flex-row">
        <nav
          aria-label={t("主菜单", "Main menu")}
          className="flex shrink-0 gap-1 overflow-x-auto border-b p-3 md:w-48 md:flex-col md:border-r md:border-b-0"
        >
          {menus.map(([href, zh, en]) => (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap rounded-md px-4 py-3 text-sm ${path === href || (href !== "/" && path.startsWith(href)) ? "bg-primary text-white" : "hover:bg-muted"}`}
            >
              {t(zh, en)}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
