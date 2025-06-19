import type { SVGProps } from 'react';
import Link from 'next/link';

// New Evoke Skor icon
const EvokeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64" // Adjusted viewBox for more detail
    fill="currentColor" // Fill for silhouette
    stroke="none"
    {...props}
  >
    {/* Simplified path for the Evoke martial artist silhouette */}
    <path
      d="M32.7,10.5c-1.1-0.2-2.2,0.4-2.7,1.4c-0.3,0.7-0.3,1.4-0.1,2.1l3.4,10.2c0.2,0.5,0.6,0.9,1.1,1.1l6.3,2.1
      c0.7,0.2,1.5,0.1,2.1-0.3c1-0.7,1.3-2,0.7-3l-3.8-8.1C38.9,14.2,37.2,12.7,35,12.4L32.7,10.5z
      M26.5,21.3c-1.8-0.4-3.6,0.2-4.9,1.5c-1.3,1.3-2,3-1.8,4.8l1.1,8.8c0.1,1,0.7,1.9,1.5,2.4l4.8,3.2
      c0.6,0.4,1.2,0.6,1.8,0.6c1.4,0,2.7-0.9,3.1-2.3l3.7-10.7c0.2-0.7,0.1-1.4-0.2-2l-6-7.5C28.7,21.4,27.6,21.1,26.5,21.3z
      M20.1,42.8l-2.6,6.1c-0.4,0.9-0.2,1.9,0.5,2.6c0.5,0.5,1.1,0.7,1.7,0.7c0.4,0,0.7-0.1,1.1-0.3l8.1-5.3
      c0.6-0.4,1-1,1.1-1.7l0.8-5.1c0.1-0.4-0.1-0.8-0.4-1.1l-6.7-6.7c-0.4-0.4-1-0.6-1.5-0.4L20.1,42.8z
      M45.1,32.9c-0.6-0.2-1.2,0-1.7,0.4l-5.4,5.4c-0.3,0.3-0.4,0.7-0.4,1.1l-0.7,4.7c-0.1,0.7,0.2,1.4,0.7,1.8
      c0.7,0.6,1.8,0.7,2.7,0.2l7.4-4.1c0.7-0.4,1.1-1.1,1.1-1.9l0.3-6.1c0-0.8-0.4-1.6-1.1-2C47.2,32.8,46.1,32.6,45.1,32.9z
      M38.5,51.2l-3.2,7.1c-0.3,0.7-0.1,1.5,0.4,2c0.4,0.4,0.9,0.6,1.4,0.6c0.3,0,0.6-0.1,0.8-0.2l6.5-3.6
      c0.5-0.3,0.9-0.8,1-1.4l0.7-4.2c0.1-0.3-0.1-0.7-0.3-0.9l-5.4-5.4C39.8,50.6,39.1,50.8,38.5,51.2z"
    />
  </svg>
);


export function AppLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
      <EvokeIcon className="h-8 w-8 text-primary" />
      <span className="text-2xl font-headline font-semibold">Evoke Skor</span>
    </Link>
  );
}
