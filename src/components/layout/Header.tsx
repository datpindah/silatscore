
"use client";

import Link from 'next/link';
import { AppLogo } from './AppLogo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetClose } from '@/components/ui/sheet'; // SheetClose ditambahkan
import { Menu, LogOut, UserCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useState, useEffect, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext'; // Menggunakan AuthContext

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/scoring', label: 'Scoring' },
  { href: '/admin', label: 'Admin' },
];

const ACTIVATION_THRESHOLD_PX = 50;

// Ditambahkan prop overrideBackgroundClass
export function Header({ overrideBackgroundClass }: { overrideBackgroundClass?: string }) {
  const { user, signOut, loading: authLoading } = useAuth(); // Dari AuthContext
  const [isVisible, setIsVisible] = useState(false);
  const [isMouseOverHeader, setIsMouseOverHeader] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);


  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (event.clientY < ACTIVATION_THRESHOLD_PX) {
        setIsVisible(true);
      } else {
        if (!isMouseOverHeader) {
          setIsVisible(false);
        }
      }
    };

    const handleDocumentMouseLeave = () => {
      if (!isMouseOverHeader) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.documentElement.addEventListener('mouseleave', handleDocumentMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.documentElement.removeEventListener('mouseleave', handleDocumentMouseLeave);
    };
  }, [isMouseOverHeader]);

  const handleHeaderMouseEnter = () => {
    setIsMouseOverHeader(true);
    setIsVisible(true);
  };

  const handleHeaderMouseLeave = (event: PointerEvent<HTMLElement>) => {
    setIsMouseOverHeader(false);
    if (event.clientY >= ACTIVATION_THRESHOLD_PX) {
      setIsVisible(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setIsSheetOpen(false); // Tutup sheet setelah logout
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border/40",
        // Menggunakan overrideBackgroundClass jika ada, jika tidak gunakan default
        overrideBackgroundClass || "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "transition-transform duration-300 ease-in-out",
        !isVisible && "-translate-y-full"
      )}
      onMouseEnter={handleHeaderMouseEnter}
      onMouseLeave={handleHeaderMouseLeave}
    >
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <AppLogo />

        <div className="flex items-center gap-2">
          <nav className="hidden md:flex gap-1 items-center">
            {navItems.map((item) => (
              <Button key={item.label} variant="ghost" asChild size="sm">
                <Link href={item.href} className="text-sm font-medium text-foreground/80 hover:text-foreground">
                  {item.label}
                </Link>
              </Button>
            ))}
            {user && (
              <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={authLoading}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            )}
          </nav>
          {user && (
            <div className="hidden md:flex items-center text-sm text-muted-foreground border-l pl-2 ml-1">
              <UserCircle className="h-4 w-4 mr-1.5" />
              {user.email || 'Pengguna'}
            </div>
          )}
          <ThemeToggle />
          <div className="md:hidden">
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <div className="flex flex-col h-full">
                  <nav className="grid gap-4 text-lg font-medium mt-8 flex-grow">
                    <SheetClose asChild>
                      <AppLogo />
                    </SheetClose>
                    {navItems.map((item) => (
                      <SheetClose key={item.label} asChild>
                        <Link
                          href={item.href}
                          className="text-muted-foreground hover:text-foreground py-2"
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </nav>
                  {user && (
                    <div className="border-t pt-4 mt-auto">
                       <div className="flex items-center text-sm text-muted-foreground mb-3 px-1">
                         <UserCircle className="h-5 w-5 mr-2" />
                         {user.email || 'Pengguna Terdaftar'}
                       </div>
                      <Button variant="outline" className="w-full" onClick={handleSignOut} disabled={authLoading}>
                        <LogOut className="mr-2 h-4 w-4" /> Logout
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
