"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, FileText, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSupabaseBrowser } from "@/lib/supabase/client";

const items = [
  { title: "Files", href: "/dashboard", icon: FileText },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { title: "Account", href: "/dashboard/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const sb = getSupabaseBrowser();
    if (!sb) {
      toast.error("Not configured.");
      return;
    }
    await sb.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-3 px-3 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 px-1 text-[15px] font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:justify-center"
        >
          <span className="truncate">Translate</span>
        </Link>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      className="rounded-none"
                      onClick={() => router.push(item.href)}
                    >
                      <Icon className="size-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
            Appearance
          </span>
          <ThemeToggle />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="rounded-none text-muted-foreground hover:text-foreground"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
