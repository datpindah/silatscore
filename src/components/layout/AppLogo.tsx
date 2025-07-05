import Image from 'next/image';
import Link from 'next/link';
import evokeLogo from '@/components/layout/public/evoke.png';

export function AppLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
      <Image 
        src={evokeLogo}
        alt="Evoke Skor Logo"
        width={48}
        height={48}
        className="h-12 w-12"
        data-ai-hint="logo"
      />
    </Link>
  );
}
