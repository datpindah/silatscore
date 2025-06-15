
// This page is now obsolete.
// The functionality for selecting TGR roles has been moved to /scoring/tgr/login/page.tsx
// Users will be directed to /scoring/tgr/login from /scoring page.

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import { Button } from "@/components/ui/button";

export default function ObsoleteTGRRoleSelectionPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 text-center">
        <PageTitle
          title="Halaman Pindah"
          description="Pemilihan peran untuk TGR sekarang dilakukan setelah login."
        />
        <div className="mt-8">
          <Button asChild>
            <Link href="/scoring/tgr/login">Lanjut ke Login Panel TGR</Link>
          </Button>
           <p className="mt-4 text-sm text-muted-foreground">
            Atau <Link href="/scoring" className="underline hover:text-primary">kembali ke pilihan mode scoring</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
