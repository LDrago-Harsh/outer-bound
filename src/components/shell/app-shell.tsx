"use client";

import * as React from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { loadSettings, SETTINGS_CHANGED_EVENT } from "@/lib/settings";

const COLLAPSED_KEY = "outerbound.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [appName, setAppName] = React.useState("Outerbound");

  React.useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  // Apply global preferences (app name, density) and react to changes.
  React.useEffect(() => {
    const apply = async () => {
      const settings = await loadSettings();
      setAppName(settings.appName || "Outerbound");
      document.title = settings.appName || "Outerbound";
      document.documentElement.classList.toggle(
        "compact",
        settings.density === "compact"
      );
    };
    apply();
    window.addEventListener(SETTINGS_CHANGED_EVENT, apply);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, apply);
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, prev ? "0" : "1");
      return !prev;
    });
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} appName={appName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
