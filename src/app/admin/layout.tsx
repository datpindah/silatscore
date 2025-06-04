import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/SidebarNav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
        <div className="flex flex-col min-h-screen">
          <Header />
          <div className="flex flex-1">
            <SidebarNav />
            <SidebarInset>
              <main className="flex-1 p-4 md:p-8 overflow-auto">
                {children}
              </main>
            </SidebarInset>
          </div>
        </div>
    </SidebarProvider>
  );
}
