import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 h-[100dvh] flex-col bg-background md:flex-row">
      <DashboardSidebar />
      <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
