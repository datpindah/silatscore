
"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Timer, Users, Eye, Award, ClipboardCheck } from 'lucide-react';

interface RoleCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

function RoleCard({ title, description, href, icon: Icon }: RoleCardProps) {
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
      <CardHeader className="flex-grow">
        <CardTitle className="flex items-center font-headline text-primary">
          <Icon className="mr-3 h-7 w-7" />
          {title}
        </CardTitle>
        <CardDescription className="font-body mt-1">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
          <Link href={href}>Pilih Peran Ini</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TandingRoleSelectionPage() {
  const roles = [
    { title: "Timer Dewan 1", description: "Kontrol timer dan input skor utama untuk pertandingan.", href: "/scoring/tanding/dewan-1", icon: Timer },
    { title: "Timer Dewan 2", description: "Kontrol timer dan input skor cadangan/alternatif.", href: "/scoring/tanding/dewan-2", icon: Timer },
    { title: "Juri 1", description: "Input penilaian poin dari perspektif Juri 1.", href: "/scoring/tanding/juri-1", icon: Users },
    { title: "Juri 2", description: "Input penilaian poin dari perspektif Juri 2.", href: "/scoring/tanding/juri-2", icon: Users },
    { title: "Juri 3", description: "Input penilaian poin dari perspektif Juri 3.", href: "/scoring/tanding/juri-3", icon: Users },
    { title: "Monitoring Skor", description: "Tampilan skor langsung untuk penonton atau ofisial.", href: "/scoring/tanding/monitoring-skor", icon: Eye },
    { title: "Ketua Pertandingan", description: "Manajemen dan supervisi keseluruhan jalannya pertandingan.", href: "/scoring/tanding/ketua-pertandingan", icon: Award },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title="Pilih Peran - Scoring Tanding"
          description="Pilih peran Anda dalam sistem scoring pertandingan Tanding untuk mengakses antarmuka yang sesuai."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {roles.map(role => (
            <RoleCard key={role.title} {...role} />
          ))}
        </div>
      </main>
    </div>
  );
}
