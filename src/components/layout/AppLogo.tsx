import type { SVGProps } from 'react';
import Link from 'next/link';

// Placeholder Silat fighter icon
const SilatIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    <path d="M9 12l2 2 4-4" />
    <path d="M12 20.5s-2-1.5-2-3.5 2-4 2-4" />
    <path d="M12 20.5s2-1.5 2-3.5-2-4-2-4" />
  </svg>
);


export function AppLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
      <SilatIcon className="h-8 w-8 text-primary" />
      <span className="text-2xl font-headline font-semibold">SilatScore Digital</span>
    </Link>
  );
}
