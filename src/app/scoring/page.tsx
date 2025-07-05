"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import { Button } from "@/components/ui/button";

export default function ObsoleteScoringSelectionPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 text-center">
        <PageTitle
          title="Halaman Pindah"
          description="Akses ke panel scoring sekarang melalui halaman 'Saya'."
        />
        <div className="mt-8">
          <Button asChild>
            <Link href="/saya">Buka Halaman Saya</Link>
          </Button>
           <p className="mt-4 text-sm text-muted-foreground">
            Atau <Link href="/" className="underline hover:text-primary">kembali ke Beranda</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
