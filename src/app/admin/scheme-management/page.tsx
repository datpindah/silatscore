
"use client";

import { useState, useRef, useCallback, type ChangeEvent } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Upload, GitBranch, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { ageCategories, tgrCategoriesList, type TGRCategoryType, type Scheme, type SchemeParticipant, type SchemeRound, type SchemeMatch } from '@/lib/types';


export default function SchemeManagementPage() {
  const [tandingAge, setTandingAge] = useState<string>('Dewasa');
  const [tandingClass, setTandingClass] = useState('Kelas A Putra');
  const [tandingParticipants, setTandingParticipants] = useState(8);

  const [tgrAge, setTgrAge] = useState<string>('Remaja');
  const [tgrCategory, setTgrCategory] = useState<TGRCategoryType>('Tunggal');
  const [tgrParticipants, setTgrParticipants] = useState(10);
  
  const [isUploading, setIsUploading] = useState(false);

  const tandingFileInputRef = useRef<HTMLInputElement>(null);
  const tgrFileInputRef = useRef<HTMLInputElement>(null);


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
    if (byes === 0) {
        firstRoundMatchCount = participantCount / 2;
    }

    const getRoundName = (totalParticipantsInBracket: number, currentRoundPlayers: number): string => {
        if (currentRoundPlayers <= 2) return "Final";
        if (currentRoundPlayers <= 4) return "Semi Final";
        if (currentRoundPlayers <= 8) return "Perempat Final";
        if (currentRoundPlayers <= 16) return "Babak 16 Besar";
        if (currentRoundPlayers <= 32) return "Babak 32 Besar";
        if (totalParticipantsInBracket > currentRoundPlayers) return "Babak Penyisihan";
        return "Babak Awal";
    };
    
    const bracket: Omit<SchemeMatch, 'status'>[] = [];
    let matchIdCounter = 1;
    let playersInRound = nextPowerOfTwo;
    let prevRoundMatchHolders: (string | null)[] = Array.from({ length: nextPowerOfTwo }, (_, i) => `Peserta ${i + 1}`);

    let globalMatchNumberCounter = 1;

    while (playersInRound > 1) {
        const matchesInCurrentRound = playersInRound / 2;
        const currentRoundMatchHolders: (string | null)[] = [];
        const roundName = getRoundName(nextPowerOfTwo, playersInRound);

        for (let i = 0; i < matchesInCurrentRound; i++) {
            const matchId = `M${matchIdCounter++}`;
            currentRoundMatchHolders.push(matchId);
            
            const p1Source = prevRoundMatchHolders.shift() || '';
            const p2Source = prevRoundMatchHolders.shift() || '';

            let p1Name = "", p1Contingent = "", p2Name = "", p2Contingent = "";

            const isFirstRound = playersInRound === nextPowerOfTwo;
            const isByeMatch = (participantCount - byes > 0 && i >= firstRoundMatchCount) && isFirstRound;

            if (isFirstRound) {
                if(isByeMatch){
                    p1Name = ""; p1Contingent = "";
                    p2Name = "BYE"; p2Contingent = "BYE";
                } else {
                    p1Name = ""; p1Contingent = "";
                    p2Name = ""; p2Contingent = "";
                }
            } else {
                 p1Name = `(Pemenang ${p1Source})`;
                 p2Name = `(Pemenang ${p2Source})`;
            }

            bracket.push({
                matchInternalId: matchId,
                globalMatchNumber: globalMatchNumberCounter++,
                roundName: roundName,
                participant1: p1Name !== '' ? { name: p1Name, contingent: p1Contingent } : null,
                participant2: p2Name !== '' ? { name: p2Name, contingent: p2Contingent } : null,
                winnerToMatchId: "", 
            });
        }
        prevRoundMatchHolders = [...currentRoundMatchHolders];
        playersInRound /= 2;

        if (globalMatchNumberCounter > totalMatches) break;
    }

    const finalData = bracket.slice(0, totalMatches);
    
    for(let i = 0; i < totalMatches; i++){
      if(finalData[i].roundName === 'Final') continue;
      
      const currentRoundName = finalData[i].roundName;
      let nextRoundName = '';
      const roundNames = ['Babak Awal', 'Babak Penyisihan', 'Babak 32 Besar', 'Babak 16 Besar', 'Perempat Final', 'Semi Final', 'Final'];
      const currentRoundIndex = roundNames.indexOf(currentRoundName);
      if(currentRoundIndex !== -1 && currentRoundIndex < roundNames.length - 1) {
        nextRoundName = roundNames[currentRoundIndex + 1];
      } else {
        // Fallback for custom round names if needed
        if(currentRoundName.includes("Perempat")) nextRoundName = "Semi Final";
        if(currentRoundName.includes("Semi")) nextRoundName = "Final";
      }
      
      const matchesInCurrentRound = finalData.filter(m => m.roundName === currentRoundName);
      const currentIndexInRound = matchesInCurrentRound.findIndex(m => m.matchInternalId === finalData[i].matchInternalId);
      const matchesInNextRound = finalData.filter(m => m.roundName === nextRoundName);

      if(matchesInNextRound.length > 0){
        const targetMatchIndex = Math.floor(currentIndexInRound / 2);
        if(targetMatchIndex < matchesInNextRound.length){
          finalData[i].winnerToMatchId = matchesInNextRound[targetMatchIndex].matchInternalId;
        }
      }
    }

    const excelData = finalData.map(d => ({
        "ID_Pertandingan_Unik": d.matchInternalId,
        "Nomor_Partai": d.globalMatchNumber,
        "Babak": d.roundName,
        "Nama_Peserta_1": d.participant1?.name || "",
        "Kontingen_1": d.participant1?.contingent || "",
        "Nama_Peserta_2": d.participant2?.name || "",
        "Kontingen_2": d.participant2?.contingent || "",
        "Pemenang_Maju_ke_ID": d.winnerToMatchId || "",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skema Tanding");
    const safeTandingAge = tandingAge.replace(/\s+/g, '_');
    const safeTandingClass = tandingClass.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Template_Skema_Tanding_${safeTandingAge}_${safeTandingClass}_${participantCount}_Peserta.xlsx`);
  };

  const handleDownloadTgrTemplate = () => {
    const templateData = Array.from({ length: tgrParticipants }, (_, i) => ({
      "Nomor_Undian": i + 1,
      "Nama_Peserta": "", // For multiple names in Ganda/Regu, use comma separation.
      "Kontingen": "",
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skema TGR");
    const safeTgrAge = tgrAge.replace(/\s+/g, '_');
    const safeTgrCategory = tgrCategory.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Template_Skema_TGR_${safeTgrAge}_${safeTgrCategory}_${tgrParticipants}_Peserta.xlsx`);
  };

  const processUploadedTandingFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const expectedHeaders = ["ID_Pertandingan_Unik", "Nomor_Partai", "Babak", "Nama_Peserta_1", "Kontingen_1", "Nama_Peserta_2", "Kontingen_2", "Pemenang_Maju_ke_ID"];
      const actualHeaders = Object.keys(jsonData[0]);
      if (!expectedHeaders.every(h => actualHeaders.includes(h))) {
        throw new Error("Format header file XLSX tidak sesuai. Harap unduh templat yang benar.");
      }

      const roundsMap = new Map<string, SchemeMatch[]>();
      const participantsMap = new Map<string, SchemeParticipant>();

      jsonData.forEach(row => {
        const babak = row["Babak"];
        if (!roundsMap.has(babak)) roundsMap.set(babak, []);
        
        const p1Name = row["Nama_Peserta_1"];
        const p1Contingent = row["Kontingen_1"];
        if (p1Name && p1Name !== "BYE" && String(p1Name).trim() !== "" && !String(p1Name).startsWith("(Pemenang")) {
            const key = `${p1Name}-${p1Contingent}`;
            if (!participantsMap.has(key)) participantsMap.set(key, { id: key, name: p1Name, contingent: p1Contingent });
        }
        
        const p2Name = row["Nama_Peserta_2"];
        const p2Contingent = row["Kontingen_2"];
        if (p2Name && p2Name !== "BYE" && String(p2Name).trim() !== "" && !String(p2Name).startsWith("(Pemenang")) {
            const key = `${p2Name}-${p2Contingent}`;
            if (!participantsMap.has(key)) participantsMap.set(key, { id: key, name: p2Name, contingent: p2Contingent });
        }

        roundsMap.get(babak)!.push({
          matchInternalId: row["ID_Pertandingan_Unik"],
          globalMatchNumber: row["Nomor_Partai"],
          roundName: babak,
          participant1: p1Name ? { name: p1Name, contingent: p1Contingent } : null,
          participant2: p2Name ? { name: p2Name, contingent: p2Contingent } : null,
          winnerToMatchId: row["Pemenang_Maju_ke_ID"] || null,
          status: 'PENDING'
        });
      });

      const roundOrder = ['Babak Awal', 'Babak Penyisihan', 'Babak 32 Besar', 'Babak 16 Besar', 'Perempat Final', 'Semi Final', 'Final'];
      const finalRounds: SchemeRound[] = Array.from(roundsMap.entries()).map(([name, matches]) => ({
        roundNumber: roundOrder.indexOf(name) !== -1 ? roundOrder.indexOf(name) : 99, 
        name,
        matches,
      })).sort((a,b) => a.roundNumber - b.roundNumber);

      const safeAge = tandingAge.replace(/\s+/g, '_').toLowerCase();
      const safeClass = tandingClass.replace(/\s+/g, '_').toLowerCase();
      const schemeId = `tanding-${safeAge}-${safeClass}-${Date.now()}`;

      const newScheme: Scheme = {
        id: schemeId,
        type: 'Tanding',
        ageCategory: tandingAge,
        tandingClass: tandingClass,
        participantCount: participantsMap.size,
        participants: Array.from(participantsMap.values()),
        rounds: finalRounds,
        createdAt: Timestamp.now(),
      };
      
      await setDoc(doc(db, "schemes", schemeId), newScheme);
      
      alert(`Skema Tanding untuk ${tandingClass} (${tandingAge}) berhasil disimpan. Anda sekarang dapat membuat jadwal untuk pertandingan babak pertama di halaman 'Jadwal Tanding'.`);

    } catch (err) {
      console.error("Error processing tanding scheme file:", err);
      alert(`Gagal memproses file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploading(false);
      if (tandingFileInputRef.current) tandingFileInputRef.current.value = "";
    }
  };
  
  const processUploadedTgrFile = async (event: ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const expectedHeaders = ["Nomor_Undian", "Nama_Peserta", "Kontingen"];
      const actualHeaders = Object.keys(jsonData[0]);
       if (!expectedHeaders.every(h => actualHeaders.includes(h))) {
        throw new Error("Format header file XLSX TGR tidak sesuai. Harap unduh templat yang benar.");
      }

      const participants: SchemeParticipant[] = jsonData.map(row => ({
          id: `${row["Kontingen"]}-${row["Nama_Peserta"]}`.replace(/\s+/g, '-'),
          name: row["Nama_Peserta"],
          contingent: row["Kontingen"],
          seed: row["Nomor_Undian"],
      }));

      const safeAge = tgrAge.replace(/\s+/g, '_').toLowerCase();
      const safeCategory = tgrCategory.replace(/\s+/g, '_').toLowerCase();
      const schemeId = `tgr-${safeAge}-${safeCategory}-${Date.now()}`;

      const newScheme: Scheme = {
          id: schemeId,
          type: 'TGR',
          ageCategory: tgrAge,
          tgrCategory: tgrCategory,
          participantCount: participants.length,
          participants: participants,
          rounds: [], // TGR schemes don't have bracket rounds in this model
          createdAt: Timestamp.now(),
      };

      await setDoc(doc(db, "schemes", schemeId), newScheme);
      
      alert(`Daftar Peserta TGR untuk ${tgrCategory} (${tgrAge}) berhasil disimpan. Anda sekarang dapat membuat jadwal di halaman 'Jadwal TGR'.`);

    } catch (err) {
       console.error("Error processing TGR scheme file:", err);
      alert(`Gagal memproses file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUploading(false);
      if (tgrFileInputRef.current) tgrFileInputRef.current.value = "";
    }
  };


  return (
    <>
      <PageTitle title="Manajemen Skema Pertandingan" description="Buat templat, isi daftar peserta, dan unggah untuk membuat blueprint bagan atau daftar peserta." />
      
      <div className="grid md:grid-cols-2 gap-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary flex items-center"><GitBranch className="mr-2" />Skema Tanding</CardTitle>
            <CardDescription>Generate templat bagan Tanding, isi nama peserta, lalu unggah untuk menyimpan struktur pertandingannya.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <Label htmlFor="tandingAge">Kategori Usia</Label>
                  <Select onValueChange={setTandingAge} value={tandingAge} disabled={isUploading}>
                    <SelectTrigger id="tandingAge"><SelectValue placeholder="Pilih Kategori Usia" /></SelectTrigger>
                    <SelectContent>
                      {ageCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
               </div>
                <div>
                  <Label htmlFor="tandingClass">Nama Kelas Tanding</Label>
                  <Input
                    id="tandingClass"
                    value={tandingClass}
                    onChange={(e) => setTandingClass(e.target.value)}
                    placeholder="cth: Kelas A Putra"
                    disabled={isUploading}
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
                disabled={isUploading}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleDownloadTandingTemplate} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isUploading}>
                <Download className="mr-2 h-4 w-4" />
                Buat & Unduh Templat
              </Button>
              <input type="file" ref={tandingFileInputRef} onChange={processUploadedTandingFile} accept=".xlsx" style={{ display: 'none' }} />
              <Button onClick={() => tandingFileInputRef.current?.click()} variant="outline" className="w-full" disabled={isUploading}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4" />}
                Unggah Skema Tanding
              </Button>
            </div>
             <p className="text-xs text-muted-foreground mt-2">
              Unggah skema untuk menyimpan blueprint bagan. Pembuatan jadwal dilakukan terpisah di halaman Jadwal Tanding.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary flex items-center"><GitBranch className="mr-2" />Skema TGR</CardTitle>
            <CardDescription>Generate templat daftar peserta TGR, isi, lalu unggah untuk menyimpan daftar pesertanya.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tgrAge">Kategori Usia</Label>
                   <Select onValueChange={setTgrAge} value={tgrAge} disabled={isUploading}>
                    <SelectTrigger id="tgrAge"><SelectValue placeholder="Pilih Kategori Usia" /></SelectTrigger>
                    <SelectContent>
                      {ageCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tgrCategory">Kategori TGR</Label>
                  <Select onValueChange={(v) => setTgrCategory(v as TGRCategoryType)} value={tgrCategory} disabled={isUploading}>
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
                disabled={isUploading}
              />
            </div>
             <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleDownloadTgrTemplate} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isUploading}>
                <Download className="mr-2 h-4 w-4" />
                Buat & Unduh Templat
              </Button>
              <input type="file" ref={tgrFileInputRef} onChange={processUploadedTgrFile} accept=".xlsx" style={{ display: 'none' }} />
              <Button onClick={() => tgrFileInputRef.current?.click()} variant="outline" className="w-full" disabled={isUploading}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4" />}
                Unggah Daftar Peserta
              </Button>
            </div>
             <p className="text-xs text-muted-foreground mt-2">
              Unggah daftar peserta TGR. Pembuatan jadwal dilakukan terpisah di halaman Jadwal TGR.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
