
"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { PageTitle } from "@/components/shared/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, User, Settings, Award, Eye, ClipboardCheck } from 'lucide-react';

interface RoleCardProps {
  title: string;
  description: string;
  destinationHref: string; // Changed from href to destinationHref
  icon: React.ElementType;
}

function RoleCard({ title, description, destinationHref, icon: Icon }: RoleCardProps) {
  const loginHref = `/scoring/tgr/login?destination=${encodeURIComponent(destinationHref)}`;
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
          <Link href={loginHref}>Pilih Peran Ini</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TGRRoleSelectionPage() {
  const roles = [
    { title: "Juri 1 (TGR)", description: "Input penilaian untuk kategori TGR dari Juri 1.", destinationHref: "/scoring/tgr/juri/juri-1", icon: User },
    { title: "Juri 2 (TGR)", description: "Input penilaian untuk kategori TGR dari Juri 2.", destinationHref: "/scoring/tgr/juri/juri-2", icon: User },
    { title: "Juri 3 (TGR)", description: "Input penilaian untuk kategori TGR dari Juri 3.", destinationHref: "/scoring/tgr/juri/juri-3", icon: User },
    { title: "Juri 4 (TGR)", description: "Input penilaian untuk kategori TGR dari Juri 4.", destinationHref: "/scoring/tgr/juri/juri-4", icon: User },
    { title: "Juri 5 (TGR)", description: "Input penilaian untuk kategori TGR dari Juri 5.", destinationHref: "/scoring/tgr/juri/juri-5", icon: User },
    { title: "Juri 6 (TGR)", description: "Input penilaian untuk kategori TGR dari Juri 6.", destinationHref: "/scoring/tgr/juri/juri-6", icon: User },
    { title: "Dewan 1 (TGR)", description: "Kontrol timer, input hukuman untuk TGR.", destinationHref: "/scoring/tgr/dewan-1", icon: Settings },
    { title: "Ketua Pertandingan (TGR)", description: "Monitoring skor juri, kalkulasi median, finalisasi TGR.", destinationHref: "/scoring/tgr/ketua-pertandingan", icon: Award },
    { title: "Monitor Skor (TGR)", description: "Tampilan skor langsung untuk pertandingan TGR.", destinationHref: "/scoring/tgr/monitoring-skor", icon: Eye },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title="Pilih Peran - Scoring TGR"
          description="Pilih peran Anda dalam sistem scoring pertandingan TGR (Tunggal, Ganda, Regu)."
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
