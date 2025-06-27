
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

    const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(participantCount));
    const byes = nextPowerOfTwo - participantCount;
    const totalMatches = participantCount - 1;
    const firstRoundMatchCount = (participantCount - byes) / 2;

    const getRoundName = (totalParticipants: number, currentRoundPlayers: number): string => {
        if (currentRoundPlayers === 2) return "Final";
        if (currentRoundPlayers === 4) return "Semi Final";
        if (currentRoundPlayers === 8) return "Perempat Final";
        if (currentRoundPlayers === 16) return "Babak 16 Besar";
        if (currentRoundPlayers === 32) return "Babak 32 Besar";
        return `Babak Penyisihan (${currentRoundPlayers} Peserta)`;
    };
    
    const bracket = [];
    let matchNumber = 1;
    let playersInRound = nextPowerOfTwo;
    let matchIdCounter = 1;
    let prevRoundMatchIds: string[] = [];

    while (playersInRound > 1) {
        const matchesInCurrentRound = playersInRound / 2;
        const currentRoundMatchIds: string[] = [];
        const roundName = getRoundName(participantCount, playersInRound);

        for (let i = 0; i < matchesInCurrentRound; i++) {
            const matchId = `M${matchIdCounter++}`;
            currentRoundMatchIds.push(matchId);
            
            let p1Name = "", p1Contingent = "", p2Name = "", p2Contingent = "";
            let winnerTo = ""; // This logic can be enhanced later if needed.
            
            const isFirstRound = playersInRound === nextPowerOfTwo;

            if (isFirstRound) {
                // Matches with real players that need filling
                if (matchNumber <= firstRoundMatchCount) {
                    p1Name = ""; p1Contingent = "";
                    p2Name = ""; p2Contingent = "";
                } else { // Matches involving BYEs
                    p1Name = ""; p1Contingent = ""; // One real participant
                    p2Name = "BYE"; p2Contingent = "BYE";
                }
            } else {
                 // Placeholder for subsequent rounds
                const sourceMatch1 = prevRoundMatchIds.shift();
                const sourceMatch2 = prevRoundMatchIds.shift();
                p1Name = `(Pemenang ${sourceMatch1})`;
                p2Name = `(Pemenang ${sourceMatch2})`;
                p1Contingent = ""; p2Contingent = "";
            }

            bracket.push({
                ID_Pertandingan_Unik: matchId,
                Nomor_Partai: matchNumber,
                Babak: roundName,
                Nama_Peserta_1: p1Name,
                Kontingen_1: p1Contingent,
                Nama_Peserta_2: p2Name,
                Kontingen_2: p2Contingent,
                Pemenang_Maju_ke_ID: winnerTo,
            });
            matchNumber++;
        }
        prevRoundMatchIds = [...currentRoundMatchIds];
        playersInRound /= 2;

        // Stop if we have generated all necessary matches
        if (matchNumber > totalMatches) break;
    }


    const finalData = bracket.slice(0, totalMatches);
    
    // Simple linking for winnerTo field
    let futureMatchIdCounter = firstRoundMatchCount + byes + 1;
    for(let i = 0; i < totalMatches; i++){
        if(i < firstRoundMatchCount + byes) { // if it's a match in a round that feeds into another
            if(finalData[i+1] && finalData[i].Babak !== 'Final') {
               const targetMatchIndex = firstRoundMatchCount + byes + Math.floor(i / 2);
               if (finalData[targetMatchIndex]) {
                  finalData[i].Pemenang_Maju_ke_ID = finalData[targetMatchIndex].ID_Pertandingan_Unik;
               }
            }
        }
    }


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
                onChange={(e) => setTandingParticipants(parseInt(e.target.value) || 0)}
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
                onChange={(e) => setTgrParticipants(parseInt(e.target.value) || 0)}
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
