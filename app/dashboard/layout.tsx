import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider className="min-h-[100dvh] w-full [--sidebar-width:15rem] [--sidebar-width-icon:3rem]">
      <AppSidebar />
      <SidebarInset className="min-h-[100dvh] rounded-none border-0 bg-background shadow-none md:peer-data-[variant=inset]:m-0">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-md md:hidden">
          <SidebarTrigger className="rounded-none" />
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm font-medium text-foreground">Translate</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="w-full px-4 py-4 md:px-6 md:py-5">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
