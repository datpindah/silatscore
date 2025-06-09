
"use client";

import Link from 'next/link';
import { AppLogo } from './AppLogo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'; // Added SheetTitle
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useState, useEffect, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/scoring', label: 'Scoring' },
  { href: '/admin', label: 'Admin' },
];

const ACTIVATION_THRESHOLD_PX = 50; // How close to the top to show the header

export function Header() {
  const [isVisible, setIsVisible] = useState(false);
  const [isMouseOverHeader, setIsMouseOverHeader] = useState(false);

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
    // Listen for mouse leaving the entire HTML document
    document.documentElement.addEventListener('mouseleave', handleDocumentMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.documentElement.removeEventListener('mouseleave', handleDocumentMouseLeave);
    };
  }, [isMouseOverHeader]); // Re-attach if isMouseOverHeader changes

  const handleHeaderMouseEnter = () => {
    setIsMouseOverHeader(true);
    setIsVisible(true); // Ensure it's visible when mouse enters header
  };

  const handleHeaderMouseLeave = (event: PointerEvent<HTMLElement>) => {
    setIsMouseOverHeader(false);
    // If mouse leaves header and is outside activation zone, hide immediately
    if (event.clientY >= ACTIVATION_THRESHOLD_PX) {
      setIsVisible(false);
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "transition-transform duration-300 ease-in-out",
        !isVisible && "-translate-y-full"
      )}
      onMouseEnter={handleHeaderMouseEnter}
      onMouseLeave={handleHeaderMouseLeave}
    >
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <AppLogo />

        <div className="flex items-center gap-2">
          <nav className="hidden md:flex gap-2 items-center">
            {navItems.map((item) => (
              <Button key={item.label} variant="ghost" asChild>
                <Link href={item.href} className="text-sm font-medium text-foreground/80 hover:text-foreground">
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
          <ThemeToggle />
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle> {/* Added SheetTitle */}
                <nav className="grid gap-6 text-lg font-medium mt-8">
                  <AppLogo />
                  {navItems.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
