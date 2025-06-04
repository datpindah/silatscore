"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarDays, UserCog, BookOpen, ListOrdered, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { AppLogo } from './AppLogo';
import { Button } from '../ui/button';

const adminNavItems = [
  { href: '/admin', label: 'Dashboard', icon: Home },
  { href: '/admin/schedule-tanding', label: 'Jadwal Tanding', icon: CalendarDays },
  { href: '/admin/schedule-tgr', label: 'Jadwal TGR', icon: ListOrdered },
  { href: '/admin/rule-clarifier', label: 'Klarifikasi Aturan', icon: BookOpen },
  // Add more admin links here if needed
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
      <SidebarHeader className="p-4 flex items-center justify-between">
        <div className="group-data-[collapsible=icon]:hidden">
          <AppLogo />
        </div>
        <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {adminNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <SidebarMenuItem key={item.label}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.label}
                    className={cn(
                      isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      'justify-start'
                    )}
                  >
                    <item.icon className="h-5 w-5 mr-3 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2">
        {/* Example Footer Item */}
        <Button variant="outline" className="w-full group-data-[collapsible=icon]:aspect-square group-data-[collapsible=icon]:p-0">
          <UserCog className="h-5 w-5 group-data-[collapsible=icon]:mx-auto" />
          <span className="ml-2 group-data-[collapsible=icon]:hidden">Admin Profile</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
