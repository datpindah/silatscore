
"use client";

import { useState } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Upload, GitBranch } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ageCategories, tgrCategoriesList, type TGRCategoryType } from '@/lib/types';


export default function SchemeManagementPage() {
  const [tandingAge, setTandingAge] = useState<string>('Dewasa');
  const [tandingClass, setTandingClass] = useState('Kelas A Putra');
  const [tandingParticipants, setTandingParticipants] = useState(8);

  const [tgrAge, setTgrAge] = useState<string>('Remaja');
  const [tgrCategory, setTgrCategory] = useState<TGRCategoryType>('Tunggal');
  const [tgrParticipants, setTgrParticipants] = useState(10);

  const handleDownloadTandingTemplate = () => {
    const participantCount = tandingParticipants;
    if (participantCount < 2) {
      alert("Jumlah peserta minimal 2 untuk membuat skema.");
      return;
    }

    const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(participantCount));
    const byes = nextPowerOfTwo - participantCount;
    const totalMatches = participantCount - 1;
    let firstRoundMatchCount = (participantCount - byes) / 2;
    // If there are no byes, all participants play in the first round.
    if (byes === 0) {
        firstRoundMatchCount = participantCount / 2;
    }


    const getRoundName = (totalParticipantsInBracket: number, currentRoundPlayers: number): string => {
        if (currentRoundPlayers === 2) return "Final";
        if (currentRoundPlayers === 4) return "Semi Final";
        if (currentRoundPlayers === 8) return "Perempat Final";
        if (currentRoundPlayers === 16) return "Babak 16 Besar";
        if (currentRoundPlayers === 32) return "Babak 32 Besar";
        if (totalParticipantsInBracket > currentRoundPlayers) return "Babak Penyisihan";
        return "Babak Pertama"; // Fallback for smaller brackets
    };
    
    const bracket = [];
    let matchNumberCounter = 1;
    let matchIdCounter = 1;
    let playersInRound = nextPowerOfTwo;
    let prevRoundMatchIds: (string | null)[] = Array.from({ length: nextPowerOfTwo }, (_, i) => `Peserta ${i + 1}`);


    while (playersInRound > 1) {
        const matchesInCurrentRound = playersInRound / 2;
        const currentRoundMatchIds: (string | null)[] = [];
        const roundName = getRoundName(nextPowerOfTwo, playersInRound);

        for (let i = 0; i < matchesInCurrentRound; i++) {
            const matchId = `M${matchIdCounter++}`;
            currentRoundMatchIds.push(matchId);
            
            let p1Name = "", p1Contingent = "", p2Name = "", p2Contingent = "";
            let winnerTo = "";

            const isFirstRound = playersInRound === nextPowerOfTwo;

            if (isFirstRound) {
                // If it is a match for players (not byes)
                if (i < firstRoundMatchCount) {
                    p1Name = ""; p1Contingent = "";
                    p2Name = ""; p2Contingent = "";
                } else { // This is a bye slot
                    p1Name = ""; p1Contingent = "";
                    p2Name = "BYE"; p2Contingent = "BYE";
                }
            } else {
                 const sourceMatch1 = prevRoundMatchIds.shift() || '';
                 const sourceMatch2 = prevRoundMatchIds.shift() || '';
                 p1Name = `(Pemenang ${sourceMatch1})`;
                 p2Name = `(Pemenang ${sourceMatch2})`;
            }

            bracket.push({
                ID_Pertandingan_Unik: matchId,
                Nomor_Partai: matchNumberCounter++,
                Babak: roundName,
                Nama_Peserta_1: p1Name,
                Kontingen_1: p1Contingent,
                Nama_Peserta_2: p2Name,
                Kontingen_2: p2Contingent,
                Pemenang_Maju_ke_ID: winnerTo,
            });
        }
        prevRoundMatchIds = [...currentRoundMatchIds];
        playersInRound /= 2;

        if (matchNumberCounter > totalMatches) break;
    }


    const finalData = bracket.slice(0, totalMatches);
    
    let nextRoundMatchIndex = firstRoundMatchCount + byes;
    for(let i = 0; i < totalMatches; i++){
        if (finalData[i].Babak !== 'Final') {
            const targetMatch = finalData[nextRoundMatchIndex + Math.floor(i / 2)];
            if(targetMatch) {
               finalData[i].Pemenang_Maju_ke_ID = targetMatch.ID_Pertandingan_Unik;
            }
        }
    }


    const ws = XLSX.utils.json_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skema Tanding");
    const safeTandingAge = tandingAge.replace(/\s+/g, '_');
    const safeTandingClass = tandingClass.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Template_Skema_Tanding_${safeTandingAge}_${safeTandingClass}_${participantCount}_Peserta.xlsx`);
  };

  const handleDownloadTgrTemplate = () => {
    const templateData = Array.from({ length: tgrParticipants }, (_, i) => ({
      Nomor_Undian: i + 1,
      Pool_Grup: "A",
      Nama_Peserta: "",
      Kontingen: "",
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skema TGR");
    const safeTgrAge = tgrAge.replace(/\s+/g, '_');
    const safeTgrCategory = tgrCategory.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Template_Skema_TGR_${safeTgrAge}_${safeTgrCategory}_${tgrParticipants}_Peserta.xlsx`);
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
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <Label htmlFor="tandingAge">Kategori Usia</Label>
                  <Select onValueChange={setTandingAge} value={tandingAge}>
                    <SelectTrigger id="tandingAge"><SelectValue placeholder="Pilih Kategori Usia" /></SelectTrigger>
                    <SelectContent>
                      {ageCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
               </div>
                <div>
                  <Label htmlFor="tandingClass">Nama Kelas</Label>
                  <Input
                    id="tandingClass"
                    value={tandingClass}
                    onChange={(e) => setTandingClass(e.target.value)}
                    placeholder="cth: Kelas A Putra"
                  />
                </div>
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
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tgrAge">Kategori Usia</Label>
                   <Select onValueChange={setTgrAge} value={tgrAge}>
                    <SelectTrigger id="tgrAge"><SelectValue placeholder="Pilih Kategori Usia" /></SelectTrigger>
                    <SelectContent>
                      {ageCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tgrCategory">Kategori TGR</Label>
                  <Select onValueChange={(v) => setTgrCategory(v as TGRCategoryType)} value={tgrCategory}>
                    <SelectTrigger id="tgrCategory"><SelectValue placeholder="Pilih Kategori TGR" /></SelectTrigger>
                    <SelectContent>
                      {tgrCategoriesList.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
             </div>
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
