
"use client";

import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Construction } from 'lucide-react';
import Link from 'next/link';

export default function MonitorSkorTGRPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle title="Monitoring Skor - TGR" description="Tampilan skor langsung untuk pertandingan TGR.">
            <Button variant="outline" asChild>
              <Link href="/scoring/tgr"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
        </PageTitle>
        <Card>
          <CardContent className="p-10 text-center">
            <Construction className="mx-auto h-24 w-24 text-yellow-500 mb-6" />
            <h2 className="text-2xl font-semibold mb-2">Halaman Dalam Pengembangan</h2>
            <p className="text-muted-foreground">
              Fungsionalitas untuk Monitoring Skor Pertandingan TGR sedang dalam tahap pengembangan.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
