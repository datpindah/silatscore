
"use client";

import { useState, useCallback, useRef } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitBranch, Users, Minus, Plus, Loader2, Upload } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { ageCategories, tgrCategoriesList, type TGRCategoryType, type Scheme, type SchemeParticipant, type SchemeRound, type SchemeMatch } from '@/lib/types';
import * as XLSX from 'xlsx';

// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

interface Participant {
  name: string;
  contingent: string;
}

export default function SchemeManagementPage() {
  const [activeTab, setActiveTab] = useState('tanding');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // General State
  const [gelanggang, setGelanggang] = useState('');

  // Tanding State
  const [tandingAge, setTandingAge] = useState<string>('Dewasa');
  const [tandingClass, setTandingClass] = useState('Kelas A Putra');
  const [tandingParticipantCount, setTandingParticipantCount] = useState(8);
  const [tandingParticipants, setTandingParticipants] = useState<Participant[]>(() => Array.from({ length: 8 }, () => ({ name: '', contingent: '' })));

  // TGR State
  const [tgrAge, setTgrAge] = useState<string>('Remaja');
  const [tgrCategory, setTgrCategory] = useState<TGRCategoryType>('Tunggal');
  const [tgrParticipantCount, setTgrParticipantCount] = useState(10);
  const [tgrParticipants, setTgrParticipants] = useState<Participant[]>(() => Array.from({ length: 10 }, () => ({ name: '', contingent: '' })));

  const handleParticipantCountChange = (
    newCount: number,
    setCount: React.Dispatch<React.SetStateAction<number>>,
    setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  ) => {
    const clampedCount = Math.max(2, newCount);
    setCount(clampedCount);
    setParticipants(currentParticipants => {
      const newParticipants = [...currentParticipants];
      while (newParticipants.length < clampedCount) {
        newParticipants.push({ name: '', contingent: '' });
      }
      return newParticipants.slice(0, clampedCount);
    });
  };

  const handleParticipantInfoChange = (
    index: number,
    field: 'name' | 'contingent',
    value: string,
    setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  ) => {
    setParticipants(currentParticipants => {
      const newParticipants = [...currentParticipants];
      newParticipants[index] = { ...newParticipants[index], [field]: value };
      return newParticipants;
    });
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const processUploadedFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) return alert('Gagal membaca file.');
        
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        const newParticipants: Participant[] = jsonData.map(row => ({
          name: String(row.Nama || row.nama || row.Name || '').trim(),
          contingent: String(row.Kontingen || row.kontingen || row.Contingent || '').trim(),
        })).filter(p => p.name);

        if (newParticipants.length === 0) {
          alert('Tidak ada data peserta yang valid ditemukan di file. Pastikan kolom "Nama" dan "Kontingen" ada.');
          return;
        }

        if (activeTab === 'tanding') {
          setTandingParticipants(newParticipants);
          setTandingParticipantCount(newParticipants.length);
        } else {
          setTgrParticipants(newParticipants);
          setTgrParticipantCount(newParticipants.length);
        }

        alert(`${newParticipants.length} peserta berhasil diimpor.`);
      } catch (err) {
        console.error("Error processing file:", err);
        alert(`Gagal memproses file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };


  const handleGenerateTandingScheme = async () => {
    if (!tandingClass.trim() || !gelanggang.trim()) {
      alert("Nama Kelas Tanding dan Gelanggang tidak boleh kosong.");
      return;
    }
    if (tandingParticipants.some(p => !p.name.trim() || !p.contingent.trim())) {
      alert("Semua Nama Peserta dan Kontingen Tanding harus diisi.");
      return;
    }
    setIsLoading(true);

    try {
      const shuffledParticipants = shuffleArray([...tandingParticipants]);
      const participantCount = shuffledParticipants.length;
      const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(participantCount));
      const byes = nextPowerOfTwo - participantCount;
      const firstRoundMatchCount = (participantCount - byes) / 2;

      const getRoundName = (totalInBracket: number, currentRoundPlayers: number): string => {
        if (currentRoundPlayers <= 2) return "Final";
        if (currentRoundPlayers <= 4) return "Semi Final";
        if (currentRoundPlayers <= 8) return "Perempat Final";
        if (currentRoundPlayers <= 16) return "Babak 16 Besar";
        if (currentRoundPlayers <= 32) return "Babak 32 Besar";
        if (totalInBracket > currentRoundPlayers) return "Penyisihan";
        return "Babak Awal";
      };

      const finalRounds: SchemeRound[] = [];
      let matchQueue: ({ type: 'participant'; data: Participant } | { type: 'placeholder'; matchId: string })[] = shuffledParticipants.map(p => ({ type: 'participant', data: p }));

      if (byes > 0) {
          const participantsForFirstRound = matchQueue.splice(0, firstRoundMatchCount * 2);
          const byeParticipants = matchQueue; // The rest get a bye
          
          matchQueue = [...participantsForFirstRound, ...byeParticipants];
      }
      
      let currentRoundMatches: SchemeMatch[] = [];
      let roundCounter = 1;
      let globalMatchCounter = 1;
      let playersInCurrentRound = matchQueue.length;
      const roundName = getRoundName(nextPowerOfTwo, playersInCurrentRound);

      while(matchQueue.length > 1) {
          const p1Node = matchQueue.shift()!;
          const p2Node = matchQueue.shift()!;

          const p1 = p1Node.type === 'participant' ? { name: p1Node.data.name, contingent: p1Node.data.contingent } : { name: `(Pemenang ${p1Node.matchId})`, contingent: '' };
          const p2 = p2Node.type === 'participant' ? { name: p2Node.data.name, contingent: p2Node.data.contingent } : { name: `(Pemenang ${p2Node.matchId})`, contingent: '' };

          currentRoundMatches.push({
              matchInternalId: `${roundName.replace(/\s+/g, '_')}-${globalMatchCounter}`,
              globalMatchNumber: globalMatchCounter++,
              roundName: roundName,
              participant1: p1,
              participant2: p2,
              winnerToMatchId: null,
              status: 'PENDING',
          });
      }

      if (currentRoundMatches.length > 0) {
          finalRounds.push({ roundNumber: roundCounter++, name: roundName, matches: currentRoundMatches });
      }

      while (finalRounds[finalRounds.length-1].matches.length > 1) {
          const lastRound = finalRounds[finalRounds.length - 1];
          const nextRoundName = getRoundName(nextPowerOfTwo, lastRound.matches.length);
          const nextRoundMatches: SchemeMatch[] = [];
          for(let i=0; i < lastRound.matches.length; i+=2) {
              const match1 = lastRound.matches[i];
              const match2 = lastRound.matches[i+1];
              
              const newMatch: SchemeMatch = {
                  matchInternalId: `${nextRoundName.replace(/\s+/g, '_')}-${globalMatchCounter}`,
                  globalMatchNumber: globalMatchCounter++,
                  roundName: nextRoundName,
                  participant1: { name: `(Pemenang Partai ${match1.globalMatchNumber})`, contingent: ''},
                  participant2: { name: `(Pemenang Partai ${match2.globalMatchNumber})`, contingent: ''},
                  winnerToMatchId: null,
                  status: 'PENDING'
              };
              nextRoundMatches.push(newMatch);
              match1.winnerToMatchId = newMatch.matchInternalId;
              match2.winnerToMatchId = newMatch.matchInternalId;
          }
          finalRounds.push({roundNumber: roundCounter++, name: nextRoundName, matches: nextRoundMatches});
      }


      const safeAge = tandingAge.replace(/\s+/g, '_').toLowerCase();
      const safeClass = tandingClass.replace(/\s+/g, '_').toLowerCase();
      const schemeId = `tanding-${safeAge}-${safeClass}-${Date.now()}`;

      const schemeParticipants: SchemeParticipant[] = tandingParticipants.map(p => ({
        id: `${p.contingent}-${p.name}`.replace(/\s+/g, '-'),
        name: p.name,
        contingent: p.contingent,
      }));

      const newScheme: Scheme = {
        id: schemeId,
        type: 'Tanding',
        ageCategory: tandingAge,
        tandingClass: tandingClass,
        gelanggang: gelanggang.trim(),
        participantCount: tandingParticipantCount,
        participants: schemeParticipants,
        rounds: finalRounds,
        createdAt: Timestamp.now(),
      };

      await setDoc(doc(db, "schemes", schemeId), newScheme);
      alert(`Skema Tanding untuk ${tandingClass} (${tandingAge}) dengan ${tandingParticipantCount} peserta berhasil dibuat!`);

    } catch (err) {
      console.error("Error generating Tanding scheme:", err);
      alert(`Gagal membuat skema: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateTgrScheme = async () => {
     if (tgrParticipants.some(p => !p.name.trim() || !p.contingent.trim())) {
      alert("Semua Nama Peserta dan Kontingen TGR harus diisi.");
      return;
    }
     if (!gelanggang.trim()) {
      alert("Gelanggang tidak boleh kosong.");
      return;
    }
    setIsLoading(true);
    try {
      const schemeParticipants: SchemeParticipant[] = tgrParticipants.map((p, index) => ({
        id: `${p.contingent}-${p.name}-${index}`.replace(/\s+/g, '-'),
        name: p.name,
        contingent: p.contingent,
        seed: index + 1,
      }));

      const safeAge = tgrAge.replace(/\s+/g, '_').toLowerCase();
      const safeCategory = tgrCategory.replace(/\s+/g, '_').toLowerCase();
      const schemeId = `tgr-${safeAge}-${safeCategory}-${Date.now()}`;

      const newScheme: Scheme = {
        id: schemeId,
        type: 'TGR',
        ageCategory: tgrAge,
        tgrCategory: tgrCategory,
        gelanggang: gelanggang.trim(),
        participantCount: tgrParticipantCount,
        participants: schemeParticipants,
        rounds: [], // TGR doesn't use bracket rounds in this model
        createdAt: Timestamp.now(),
      };

      await setDoc(doc(db, "schemes", schemeId), newScheme);
      alert(`Daftar Peserta TGR untuk ${tgrCategory} (${tgrAge}) dengan ${tgrParticipantCount} peserta berhasil disimpan.`);

    } catch(err) {
      console.error("Error generating TGR scheme:", err);
      alert(`Gagal membuat daftar peserta TGR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <PageTitle title="Manajemen Skema Pertandingan" description="Buat bagan pertandingan atau daftar peserta secara interaktif." />
      
      <input type="file" ref={fileInputRef} onChange={processUploadedFile} style={{ display: 'none' }} accept=".xlsx, .xls" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tanding">
            <GitBranch className="mr-2" /> Tanding
          </TabsTrigger>
          <TabsTrigger value="tgr">
            <Users className="mr-2" /> TGR
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="tanding">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">Generator Skema Tanding</CardTitle>
              <CardDescription>Atur detail kelas, jumlah peserta, dan masukkan data peserta untuk membuat bagan pertandingan sistem gugur secara otomatis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="tandingAge">Kategori Usia</Label>
                  <Select onValueChange={setTandingAge} value={tandingAge} disabled={isLoading}>
                    <SelectTrigger id="tandingAge"><SelectValue placeholder="Pilih Kategori Usia" /></SelectTrigger>
                    <SelectContent>
                      {ageCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tandingClass">Nama Kelas Tanding</Label>
                  <Input id="tandingClass" value={tandingClass} onChange={(e) => setTandingClass(e.target.value)} placeholder="cth: Kelas A Putra" disabled={isLoading} />
                </div>
                <div>
                  <Label htmlFor="gelanggangTanding">Gelanggang</Label>
                  <Input id="gelanggangTanding" value={gelanggang} onChange={(e) => setGelanggang(e.target.value)} placeholder="cth: Gelanggang A" disabled={isLoading} />
                </div>
                <div>
                  <Label htmlFor="tandingParticipants">Jumlah Peserta</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tandingParticipantCount - 1, setTandingParticipantCount, setTandingParticipants)} disabled={isLoading}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id="tandingParticipants" type="number" className="text-center" value={tandingParticipantCount} onChange={(e) => handleParticipantCountChange(parseInt(e.target.value) || 0, setTandingParticipantCount, setTandingParticipants)} disabled={isLoading} />
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tandingParticipantCount + 1, setTandingParticipantCount, setTandingParticipants)} disabled={isLoading}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">Data Peserta</h3>
                  <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isLoading}>
                    <Upload className="mr-2 h-4 w-4" /> Unggah Peserta (.xlsx)
                  </Button>
                </div>
                 <p className="text-xs text-muted-foreground mb-2">Pastikan file Excel memiliki kolom "Nama" dan "Kontingen".</p>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {tandingParticipants.map((p, index) => (
                    <div key={index} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
                      <Label htmlFor={`tanding-p${index}-name`} className="text-sm text-muted-foreground">{index + 1}.</Label>
                      <Input id={`tanding-p${index}-name`} placeholder="Nama Peserta" value={p.name} onChange={(e) => handleParticipantInfoChange(index, 'name', e.target.value, setTandingParticipants)} disabled={isLoading} />
                      <Input id={`tanding-p${index}-contingent`} placeholder="Kontingen" value={p.contingent} onChange={(e) => handleParticipantInfoChange(index, 'contingent', e.target.value, setTandingParticipants)} disabled={isLoading} />
                    </div>
                  ))}
                </div>
              </div>
              
              <Button onClick={handleGenerateTandingScheme} className="w-full md:w-auto" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <GitBranch className="mr-2 h-4 w-4" />}
                Buat Bagan Pertandingan Tanding
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tgr">
           <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">Generator Daftar Peserta TGR</CardTitle>
              <CardDescription>Masukkan detail dan daftar peserta TGR untuk membuat daftar tampil yang terstruktur.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <div>
                  <Label htmlFor="tgrAge">Kategori Usia</Label>
                   <Select onValueChange={setTgrAge} value={tgrAge} disabled={isLoading}>
                    <SelectTrigger id="tgrAge"><SelectValue placeholder="Pilih Kategori Usia" /></SelectTrigger>
                    <SelectContent>
                      {ageCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tgrCategory">Kategori TGR</Label>
                  <Select onValueChange={(v) => setTgrCategory(v as TGRCategoryType)} value={tgrCategory} disabled={isLoading}>
                    <SelectTrigger id="tgrCategory"><SelectValue placeholder="Pilih Kategori TGR" /></SelectTrigger>
                    <SelectContent>
                      {tgrCategoriesList.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                 <div>
                  <Label htmlFor="gelanggangTgr">Gelanggang</Label>
                  <Input id="gelanggangTgr" value={gelanggang} onChange={(e) => setGelanggang(e.target.value)} placeholder="cth: Gelanggang B" disabled={isLoading} />
                </div>
                <div>
                  <Label htmlFor="tgrParticipants">Jumlah Peserta/Tim</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tgrParticipantCount - 1, setTgrParticipantCount, setTgrParticipants)} disabled={isLoading}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id="tgrParticipants" type="number" className="text-center" value={tgrParticipantCount} onChange={(e) => handleParticipantCountChange(parseInt(e.target.value) || 0, setTgrParticipantCount, setTgrParticipants)} disabled={isLoading} />
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tgrParticipantCount + 1, setTgrParticipantCount, setTgrParticipants)} disabled={isLoading}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
               <div className="border-t pt-4">
                 <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Data Peserta</h3>
                    <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isLoading}>
                      <Upload className="mr-2 h-4 w-4" /> Unggah Peserta (.xlsx)
                    </Button>
                  </div>
                 <p className="text-xs text-muted-foreground mb-2">Untuk Ganda/Regu, pisahkan nama dengan koma pada kolom "Nama Peserta". Pastikan file Excel memiliki kolom "Nama" dan "Kontingen".</p>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {tgrParticipants.map((p, index) => (
                    <div key={index} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2">
                      <Label htmlFor={`tgr-p${index}-name`} className="text-sm text-muted-foreground">{index + 1}.</Label>
                      <Input id={`tgr-p${index}-name`} placeholder="Nama Peserta/Tim" value={p.name} onChange={(e) => handleParticipantInfoChange(index, 'name', e.target.value, setTgrParticipants)} disabled={isLoading} />
                      <Input id={`tgr-p${index}-contingent`} placeholder="Kontingen" value={p.contingent} onChange={(e) => handleParticipantInfoChange(index, 'contingent', e.target.value, setTgrParticipants)} disabled={isLoading} />
                    </div>
                  ))}
                </div>
              </div>

               <Button onClick={handleGenerateTgrScheme} className="w-full md:w-auto" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Users className="mr-2 h-4 w-4" />}
                Buat Daftar Peserta TGR
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
