"use client";

import Link from 'next/link';
import { AppLogo } from './AppLogo';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useState, useEffect, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/saya', label: 'Saya' },
];

const ACTIVATION_THRESHOLD_PX = 50;

export function Header({ overrideBackgroundClass }: { overrideBackgroundClass?: string }) {
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

  const baseClasses = "sticky top-0 z-50 w-full border-b border-border/40";
  const transitionClasses = "transition-transform duration-300 ease-in-out";
  const visibilityAndTransformClasses = isVisible
    ? "transform-none"
    : "-translate-y-full";
  
  let finalClassName;

  if (overrideBackgroundClass) {
    finalClassName = cn(
      baseClasses,
      transitionClasses,
      visibilityAndTransformClasses,
      overrideBackgroundClass
    );
  } else {
    finalClassName = cn(
      baseClasses,
      transitionClasses,
      visibilityAndTransformClasses,
      "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    );
  }

  return (
    <header
      className={finalClassName}
      onMouseEnter={handleHeaderMouseEnter}
      onMouseLeave={handleHeaderMouseLeave}
    >
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
        <AppLogo />
        <div className="flex items-center gap-2">
          <nav className="flex gap-1 items-center">
            {navItems.map((item) => (
              <Button key={item.label} variant="ghost" asChild size="sm">
                <Link href={item.href} className="text-sm font-medium text-foreground/80 hover:text-foreground">
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
