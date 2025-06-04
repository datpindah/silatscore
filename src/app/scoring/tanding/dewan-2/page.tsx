
"use client";

import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function DewanDuaPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title="Timer Dewan 2 - Scoring Tanding"
          description="Halaman untuk Timer Dewan 2. Fitur akan segera tersedia."
        />
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2 font-headline">Segera Hadir</h2>
            <p className="text-muted-foreground font-body">
              Fungsionalitas untuk halaman Timer Dewan 2 sedang dalam pengembangan.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
