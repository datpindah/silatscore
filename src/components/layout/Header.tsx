
import Link from 'next/link';
import { AppLogo } from './AppLogo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/scoring', label: 'Scoring' },
  { href: '/admin', label: 'Admin' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
