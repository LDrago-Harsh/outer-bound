import {
  LayoutDashboard,
  Download,
  Users,
  FileText,
  Send,
  Server,
  ListTodo,
  Inbox,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Import", href: "/import", icon: Download },
  { title: "Leads", href: "/leads", icon: Users },
  { title: "Templates", href: "/templates", icon: FileText },
  { title: "Campaigns", href: "/campaigns", icon: Send },
  { title: "SMTP", href: "/smtp", icon: Server },
  { title: "Queue", href: "/queue", icon: ListTodo },
  { title: "Inbox", href: "/inbox", icon: Inbox },
  { title: "Reports", href: "/reports", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function pageTitle(pathname: string): string {
  return (
    NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.title ?? ""
  );
}
