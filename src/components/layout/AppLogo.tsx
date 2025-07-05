
import Image from 'next/image';
import Link from 'next/link';

export function AppLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
      <Image 
        src="https://placehold.co/40x40.png"
        alt="Evoke Skor Logo"
        width={32}
        height={32}
        className="h-8 w-8"
        data-ai-hint="logo"
      />
      <span className="text-2xl font-headline font-semibold">Evoke Skor</span>
    </Link>
  );
}
