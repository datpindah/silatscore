
"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function KetuaPertandinganPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title="Ketua Pertandingan - Tanding"
          description="Panel manajemen untuk Ketua Pertandingan Tanding. Fitur akan segera tersedia."
        >
          <Button variant="outline" asChild>
            <Link href="/scoring/tanding">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Pilihan Peran
            </Link>
          </Button>
        </PageTitle>
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2 font-headline">Segera Hadir</h2>
            <p className="text-muted-foreground font-body">
              Fungsionalitas untuk halaman Ketua Pertandingan sedang dalam pengembangan.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
