
"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Sword } from 'lucide-react'; // Icons for Tanding and TGR

export default function ScoringSelectionPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title="Pilih Mode Scoring"
          description="Pilih jenis pertandingan Pencak Silat yang ingin Anda nilai."
        />

        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center font-headline text-primary">
                <Sword className="mr-3 h-7 w-7" />
                Scoring Tanding
              </CardTitle>
              <CardDescription className="font-body">
                Masuk ke halaman scoring untuk pertandingan kategori Tanding (duel satu lawan satu).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/login">Mulai Scoring Tanding</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center font-headline text-primary">
                <Users className="mr-3 h-7 w-7" />
                Scoring TGR
              </CardTitle>
              <CardDescription className="font-body">
                Masuk ke halaman scoring untuk pertandingan kategori TGR (Tunggal, Ganda, Regu).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/scoring/tgr/login">Mulai Scoring TGR</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
