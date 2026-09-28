"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
type Locale = {
  lang: "zh" | "en";
  toggle: () => void;
  t: (zh: string, en: string) => string;
};
const LocaleContext = createContext<Locale>({
  lang: "zh",
  toggle: () => {},
  t: (zh) => zh,
});
export const useLocale = () => useContext(LocaleContext);
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("groundwork-locale", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("groundwork-locale", notify);
  };
};
const snapshot = () =>
  "en" === localStorage.getItem("groundwork-language")
    ? ("en" as const)
    : ("zh" as const);
export function Providers({ children }: { children: React.ReactNode }) {
  const [query] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 3000, refetchOnWindowFocus: false },
        },
      }),
  );
  const lang = useSyncExternalStore(subscribe, snapshot, () => "zh" as const);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  const toggle = () => {
    localStorage.setItem("groundwork-language", lang === "zh" ? "en" : "zh");
    window.dispatchEvent(new Event("groundwork-locale"));
  };
  return (
    <QueryClientProvider client={query}>
      <LocaleContext
        value={{ lang, toggle, t: (zh, en) => (lang === "zh" ? zh : en) }}
      >
        {children}
      </LocaleContext>
    </QueryClientProvider>
  );
}
