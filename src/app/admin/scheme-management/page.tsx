
"use client";

import { useState } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Upload, GitBranch } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SchemeManagementPage() {
  const [tandingParticipants, setTandingParticipants] = useState(8);
  const [tgrParticipants, setTgrParticipants] = useState(10);
  const [className, setClassName] = useState('Kelas A Dewasa Putra');

  const handleDownloadTandingTemplate = () => {
    const participantCount = tandingParticipants;
    if (participantCount < 2) {
      alert("Jumlah peserta minimal 2 untuk membuat skema.");
      return;
    }

    // Calculate bracket properties
    const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(participantCount));
    const totalRounds = Math.log2(nextPowerOfTwo);
    const byes = nextPowerOfTwo - participantCount;
    
    const bracketData = [];
    let matchCounter = 1;
    let roundMatches: any[] = [];
    
    // Simplified seeding for template
    let participants = Array.from({ length: participantCount }, (_, i) => ({ name: `Peserta ${i + 1}`, contingent: `Kontingen ${i + 1}`}));
    let byeReceivers = participants.slice(0, byes);
    let round1Players = participants.slice(byes);

    // Generate Round 1
    for (let i = 0; i < round1Players.length / 2; i++) {
        roundMatches.push({
            matchInternalId: `R1-M${i+1}`,
            globalMatchNumber: matchCounter++,
            roundNumber: 1,
            roundName: "Penyisihan",
            participant1_name: "", // User to fill
            participant1_contingent: "",
            participant2_name: "", // User to fill
            participant2_contingent: "",
            winnerToMatchId: `R2-M${Math.floor(i / 2) + 1}`,
        });
    }

    // This is a simplified generator. A full one is more complex.
    // For now, we will create a simple list for users to fill.
    const templateData = [
        {
            ID_Pertandingan_Unik: "A-DWS-PENYISIHAN-1",
            Nomor_Partai_Global: 1,
            Babak: "Penyisihan",
            Nama_Peserta_1: "",
            Kontingen_1: "",
            Nama_Peserta_2: "",
            Kontingen_2: "",
            Pemenang_Maju_ke_ID: "A-DWS-PEREMPAT-1",
        },
        {
            ID_Pertandingan_Unik: "A-DWS-PEREMPAT-1",
            Nomor_Partai_Global: 5,
            Babak: "Perempat Final",
            Nama_Peserta_1: "(Pemenang A-DWS-PENYISIHAN-1)",
            Kontingen_1: "",
            Nama_Peserta_2: "BYE",
            Kontingen_2: "BYE",
            Pemenang_Maju_ke_ID: "A-DWS-SEMI-1",
        }
    ];

    const finalData = Array.from({ length: participantCount -1 }, (_, i) => ({
      ID_Pertandingan_Unik: `MATCH-${i + 1}`,
      Nomor_Partai_Global: i + 1,
      Babak: "Penyisihan",
      Nama_Peserta_1: "",
      Kontingen_1: "",
      Nama_Peserta_2: "",
      Kontingen_2: "",
      Pemenang_Maju_ke_ID: i + 1 < participantCount - 1 ? `MATCH-${i + 2}`: "FINAL",
    }));

    const ws = XLSX.utils.json_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skema Tanding");
    XLSX.writeFile(wb, `Template_Skema_Tanding_${className.replace(/\s+/g, '_')}_${participantCount}_Peserta.xlsx`);
  };

  const handleDownloadTgrTemplate = () => {
    const templateData = Array.from({ length: tgrParticipants }, (_, i) => ({
      Nomor_Undian: i + 1,
      Pool_Grup: "A",
      Kategori_TGR: "Tunggal",
      Nama_Peserta: "",
      Kontingen: "",
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skema TGR");
    XLSX.writeFile(wb, `Template_Skema_TGR_${tgrParticipants}_Peserta.xlsx`);
  };


  return (
    <>
      <PageTitle title="Manajemen Skema Pertandingan" description="Buat templat skema berdasarkan jumlah peserta, isi, dan unggah untuk integrasi otomatis dengan jadwal." />
      
      <div className="grid md:grid-cols-2 gap-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary flex items-center"><GitBranch className="mr-2" />Skema Tanding</CardTitle>
            <CardDescription>Generate templat skema untuk kategori Tanding (sistem gugur).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="className">Nama Kelas</Label>
              <Input
                id="className"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="cth: Kelas A Dewasa Putra"
              />
            </div>
            <div>
              <Label htmlFor="tandingParticipants">Jumlah Peserta</Label>
              <Input
                id="tandingParticipants"
                type="number"
                value={tandingParticipants}
                onChange={(e) => setTandingParticipants(parseInt(e.target.value, 10))}
                min="2"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleDownloadTandingTemplate} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                <Download className="mr-2 h-4 w-4" />
                Buat & Unduh Templat
              </Button>
              <Button onClick={() => alert("Fitur unggah skema akan segera diimplementasikan.")} variant="outline" className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                Unggah Skema
              </Button>
            </div>
             <p className="text-xs text-muted-foreground mt-2">
              Unduh templat, isi nama peserta sesuai bagan yang Anda miliki, lalu unggah kembali. Sistem akan membuat jadwal babak pertama secara otomatis.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary flex items-center"><GitBranch className="mr-2" />Skema TGR</CardTitle>
            <CardDescription>Generate templat daftar peserta untuk kategori TGR (Tunggal, Ganda, Regu).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="tgrParticipants">Jumlah Peserta/Tim</Label>
              <Input
                id="tgrParticipants"
                type="number"
                value={tgrParticipants}
                onChange={(e) => setTgrParticipants(parseInt(e.target.value, 10))}
                min="1"
              />
            </div>
             <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleDownloadTgrTemplate} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                <Download className="mr-2 h-4 w-4" />
                Buat & Unduh Templat
              </Button>
              <Button onClick={() => alert("Fitur unggah skema akan segera diimplementasikan.")} variant="outline" className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                Unggah Skema
              </Button>
            </div>
             <p className="text-xs text-muted-foreground mt-2">
              Sistem TGR umumnya berbasis skor. Templat ini digunakan untuk mendaftarkan semua peserta dalam satu kategori.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
