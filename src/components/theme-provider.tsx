"use client";
// SSR-safe adaptation of shadcn-admin's local theme preference.
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("groundwork-theme", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("groundwork-theme", notify);
  };
};
const snapshot = (): Theme => {
  try {
    return localStorage.getItem("groundwork-theme") === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
};
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "light" as const,
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  const toggleTheme = () => {
    try {
      localStorage.setItem(
        "groundwork-theme",
        theme === "light" ? "dark" : "light",
      );
    } catch {
      return;
    }
    window.dispatchEvent(new Event("groundwork-theme"));
  };
  return <ThemeContext value={{ theme, toggleTheme }}>{children}</ThemeContext>;
}
export const useTheme = () => useContext(ThemeContext);
