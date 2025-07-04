
"use client";

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitBranch, Users, Minus, Plus, Loader2, Upload, Download, Save, LayoutGrid, CalendarPlus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { ageCategories, tgrCategoriesList, type TGRCategoryType, type Scheme, type SchemeParticipant, type SchemeRound, type SchemeMatch, type ScheduleTanding } from '@/lib/types';
import * as XLSX from 'xlsx';
import { FormField } from '@/components/admin/ScheduleFormFields';
import { BracketView } from '@/components/admin/BracketView';

interface Participant {
  name: string;
  contingent: string;
}

export default function SchemeManagementPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('tanding');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generatedScheme, setGeneratedScheme] = useState<Scheme | null>(null);
  
  const [isSchemeSaved, setIsSchemeSaved] = useState(false);
  const [isGeneratingSchedules, setIsGeneratingSchedules] = useState(false);
  const [schedulesGenerated, setSchedulesGenerated] = useState(false);


  // General State
  const [gelanggangs, setGelanggangs] = useState('Gelanggang 1, Gelanggang 2');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Tanding State
  const [tandingAge, setTandingAge] = useState<string>('Dewasa');
  const [tandingClass, setTandingClass] = useState('Kelas A Putra');
  const [tandingParticipants, setTandingParticipants] = useState<Participant[]>(() => Array.from({ length: 8 }, () => ({ name: '', contingent: '' })));

  // TGR State
  const [tgrAge, setTgrAge] = useState<string>('Remaja');
  const [tgrCategory, setTgrCategory] = useState<TGRCategoryType>('Tunggal');
  const [tgrParticipants, setTgrParticipants] = useState<Participant[]>(() => Array.from({ length: 10 }, () => ({ name: '', contingent: '' })));

  const handleParticipantCountChange = (
    newCount: number,
    setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  ) => {
    const clampedCount = Math.max(2, Math.min(32, isNaN(newCount) ? 2 : newCount));
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
  
  const handleDownloadTemplate = () => {
    const headers = ["Nama", "Kontingen"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = [{ wch: 35 }, { wch: 35 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Peserta");
    XLSX.writeFile(wb, "Template_Unggah_Peserta.xlsx");
    alert("Template untuk unggah data peserta telah berhasil diunduh.");
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
        } else {
          setTgrParticipants(newParticipants);
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
  
  const handleGenerateTandingScheme = () => {
    const gelanggangList = gelanggangs.split(',').map(g => g.trim()).filter(Boolean);
    if (gelanggangList.length === 0) {
        alert("Nama Gelanggang tidak boleh kosong.");
        return;
    }
    const finalParticipants = tandingParticipants.filter(p => p.name.trim() && p.contingent.trim());
    const numParticipants = finalParticipants.length;
    if (numParticipants < 2) {
      alert("Dibutuhkan minimal 2 peserta untuk membuat bagan yang valid.");
      return;
    }
     if (numParticipants > 32) {
      alert("Generator saat ini mendukung maksimal 32 peserta.");
      return;
    }

    setIsLoading(true);
    setGeneratedScheme(null);
    
    setTimeout(() => {
        try {
            // 1. Create participant objects
            const participantsWithSeeds: (SchemeParticipant | { id: 'bye' })[] = finalParticipants.map((p, index) => ({
              id: `p-${index + 1}-${p.name.replace(/\s+/g, '-')}`,
              name: p.name,
              contingent: p.contingent,
              seed: index + 1
            }));

            const numRealParticipants = participantsWithSeeds.length;
            const bracketSize = Math.pow(2, Math.ceil(Math.log2(numRealParticipants)));
            const numRounds = Math.log2(bracketSize);
            const numByes = bracketSize - numRealParticipants;

            // Add BYEs to the list
            for (let i = 0; i < numByes; i++) {
                participantsWithSeeds.push({ id: 'bye' });
            }

            // Standard seeding order for a 32-player bracket (can be sliced for smaller brackets)
            const seedOrder32 = [
                1, 32, 17, 16, 8, 25, 24, 9, 5, 28, 21, 12, 4, 29, 20, 13,
                2, 31, 18, 15, 7, 26, 23, 10, 6, 27, 22, 11, 3, 30, 19, 14
            ];

            const currentSeedOrder = seedOrder32.slice(0, bracketSize);

            const seededParticipants = currentSeedOrder.map(seed => {
                // Find the participant with this seed number.
                // Seeds are 1-based, array indices are 0-based.
                const participant = participantsWithSeeds[seed - 1];
                return participant || { id: 'bye' }; // Fallback to bye if participant not found (for empty slots)
            });

            const allRounds: SchemeRound[] = [];
            let matchNumberCounter = 1;

            // Create Round 1
            const round1Matches: SchemeMatch[] = [];
            for (let i = 0; i < bracketSize / 2; i++) {
                const p1 = seededParticipants[i * 2];
                const p2 = seededParticipants[i * 2 + 1];

                const p1IsBye = p1.id === 'bye';
                const p2IsBye = p2.id === 'bye';

                round1Matches.push({
                    id: `r1-m${i + 1}`,
                    matchInternalId: `r1-m${i + 1}`,
                    round: 1,
                    matchNumber: matchNumberCounter++,
                    participant1: p1IsBye ? null : p1 as SchemeParticipant,
                    participant2: p2IsBye ? null : p2 as SchemeParticipant,
                    winnerId: p1IsBye ? (p2 as SchemeParticipant).id : p2IsBye ? (p1 as SchemeParticipant).id : null,
                    nextMatchId: `r2-m${Math.floor(i / 2) + 1}`
                });
            }
            allRounds.push({ roundNumber: 1, name: `Babak ${bracketSize}`, matches: round1Matches });
            
            // Create subsequent rounds
            for (let r = 2; r <= numRounds; r++) {
                const matchesInPreviousRound = allRounds[r - 2].matches;
                const currentRoundMatches: SchemeMatch[] = [];
                const numMatchesInCurrentRound = matchesInPreviousRound.length / 2;

                for (let i = 0; i < numMatchesInCurrentRound; i++) {
                    const nextMatchId = (r < numRounds) ? `r${r + 1}-m${Math.floor(i / 2) + 1}` : null;
                    currentRoundMatches.push({
                        id: `r${r}-m${i + 1}`,
                        matchInternalId: `r${r}-m${i + 1}`,
                        round: r,
                        matchNumber: matchNumberCounter++,
                        participant1: null,
                        participant2: null,
                        winnerId: null,
                        nextMatchId: nextMatchId
                    });
                }
                
                let roundName = `Babak Penyisihan`;
                if (numMatchesInCurrentRound === 1) roundName = "Final";
                else if (numMatchesInCurrentRound === 2) roundName = "Semi Final";
                else if (numMatchesInCurrentRound === 4) roundName = "Perempat Final";
                else roundName = `Babak ${numMatchesInCurrentRound * 2}`;
                
                allRounds.push({ roundNumber: r, name: roundName, matches: currentRoundMatches });
            }

            // Auto-advance winners from Round 1 byes
            allRounds[0].matches.forEach((match, index) => {
                if (match.winnerId) {
                    const nextRound = allRounds[1];
                    const nextMatchIndex = Math.floor(index / 2);
                    const nextMatch = nextRound.matches[nextMatchIndex];

                    const winnerParticipant = match.participant1?.id === match.winnerId ? match.participant1 : match.participant2;

                    if (index % 2 === 0) {
                        nextMatch.participant1 = winnerParticipant;
                    } else {
                        nextMatch.participant2 = winnerParticipant;
                    }
                }
            });


            const newScheme: Scheme = {
                id: `tanding-${tandingAge.replace(/\s+/g, '_').toLowerCase()}-${tandingClass.replace(/\s+/g, '_').toLowerCase()}-${Date.now()}`,
                type: 'Tanding',
                ageCategory: tandingAge,
                tandingClass: tandingClass.trim(),
                gelanggangs: gelanggangList,
                date: eventDate,
                participantCount: numParticipants,
                participants: finalParticipants.map((p, index) => ({
                    id: `p-${index + 1}-${p.name.replace(/\s+/g, '-')}`,
                    name: p.name,
                    contingent: p.contingent,
                    seed: index + 1
                })),
                rounds: allRounds,
                createdAt: Timestamp.now(),
            };
          
            setGeneratedScheme(newScheme);
            setIsSchemeSaved(false);
            setSchedulesGenerated(false);
            alert(`Pratinjau Skema Tanding untuk ${tandingClass} (${tandingAge}) berhasil dibuat!`);

        } catch (err) {
            console.error("Error generating Tanding scheme:", err);
            alert(`Gagal membuat pratinjau skema: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
        }
    }, 500);
  };


  const handleGenerateTgrScheme = () => {
     if (tgrParticipants.some(p => !p.name.trim() || !p.contingent.trim())) {
      alert("Semua Nama Peserta dan Kontingen TGR harus diisi.");
      return;
    }
     const gelanggangList = gelanggangs.split(',').map(g => g.trim()).filter(Boolean);
     if (gelanggangList.length === 0 || !eventDate) {
      alert("Gelanggang dan Tanggal tidak boleh kosong.");
      return;
    }
    
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
      gelanggangs: gelanggangList,
      date: eventDate,
      participantCount: tgrParticipants.length,
      participants: schemeParticipants,
      rounds: [], 
      createdAt: Timestamp.now(),
    };

    setGeneratedScheme(newScheme);
    setIsSchemeSaved(false);
    setSchedulesGenerated(false);
    alert(`Pratinjau Daftar Peserta TGR untuk ${tgrCategory} (${tgrAge}) berhasil dibuat.`);
  };

  const handleSaveScheme = async () => {
    if (!generatedScheme) {
      alert("Tidak ada skema yang dibuat untuk disimpan.");
      return;
    }
    setIsLoading(true);
    try {
        const dataToSave: Partial<Scheme> = { ...generatedScheme };
        
        // Ensure we don't save undefined properties
        if (dataToSave.type === 'TGR') {
            delete (dataToSave as Partial<Omit<Scheme, 'tgrCategory'>> & {tandingClass?: string | undefined}).tandingClass;
        } else {
            delete (dataToSave as Partial<Omit<Scheme, 'tandingClass'>> & {tgrCategory?: TGRCategoryType | undefined}).tgrCategory;
        }

        await setDoc(doc(db, "schemes", generatedScheme.id), dataToSave);
        setIsSchemeSaved(true);
        alert(`Bagan "${generatedScheme.tandingClass || generatedScheme.tgrCategory}" berhasil disimpan! Anda sekarang dapat melihatnya di Daftar Bagan.`);
    } catch(err) {
        console.error("Error saving scheme:", err);
        alert(`Gagal menyimpan skema: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setIsLoading(false);
    }
  };

    const handleGenerateSchedules = async () => {
    if (!generatedScheme) {
      alert("Tidak ada skema untuk dijadikan jadwal.");
      return;
    }
    if (!isSchemeSaved) {
      alert("Harap simpan bagan terlebih dahulu sebelum membuat jadwal.");
      return;
    }
    if (generatedScheme.type !== 'Tanding') {
      alert("Fitur ini saat ini hanya tersedia untuk skema Tanding.");
      return;
    }
    if (!generatedScheme.gelanggangs || generatedScheme.gelanggangs.length === 0) {
      alert("Tidak ada gelanggang yang dikonfigurasi dalam skema ini.");
      return;
    }

    setIsGeneratingSchedules(true);
    try {
      const batch = writeBatch(db);
      let scheduleCount = 0;
      const gelanggangList = generatedScheme.gelanggangs;
      let gelanggangIndex = 0;

      for (const round of generatedScheme.rounds) {
        for (const match of round.matches) {
          // A match only becomes a schedule if it has two named participants. BYEs are not scheduled.
          if (match.participant1?.name && match.participant2?.name) {
            const assignedGelanggang = gelanggangList[gelanggangIndex % gelanggangList.length];
            gelanggangIndex++;

            const scheduleDocRef = doc(db, 'schedules_tanding', match.matchInternalId || match.id);
            
            const scheduleData: Omit<ScheduleTanding, 'id'> = {
              matchNumber: match.matchNumber,
              date: generatedScheme.date, 
              place: assignedGelanggang,
              pesilatMerahName: match.participant1.name,
              pesilatMerahContingent: match.participant1.contingent,
              pesilatBiruName: match.participant2.name,
              pesilatBiruContingent: match.participant2.contingent,
              round: round.name,
              class: generatedScheme.tandingClass || '',
              matchInternalId: match.matchInternalId,
            };
            
            const scheduleDataForFirestore = {
                ...scheduleData,
                date: Timestamp.fromDate(new Date(scheduleData.date + "T00:00:00")),
            };

            batch.set(scheduleDocRef, scheduleDataForFirestore);
            scheduleCount++;
          }
        }
      }

      await batch.commit();
      setSchedulesGenerated(true);
      alert(`${scheduleCount} jadwal pertandingan berhasil dibuat dan didistribusikan ke ${gelanggangList.length} gelanggang. Anda dapat melihatnya di halaman Jadwal Tanding.`);
      router.push('/admin/schedule-tanding');
    } catch (err) {
      console.error("Error generating schedules:", err);
      alert(`Gagal membuat jadwal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGeneratingSchedules(false);
    }
  };


  return (
    <>
      <PageTitle title="Buat Skema Pertandingan" description="Buat bagan pertandingan atau daftar peserta secara interaktif. Skema yang dibuat akan tersimpan." />
      
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
          <Card className="shadow-lg bg-card text-card-foreground border-border">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">Generator Skema Tanding</CardTitle>
              <CardDescription>Atur detail kelas, jumlah peserta, dan masukkan data peserta untuk membuat bagan pertandingan sistem gugur secara otomatis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField id="date" label="Tanggal Pertandingan" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
                 <div>
                    <Label htmlFor="gelanggangs" className="block text-sm font-medium font-headline mb-1">
                      Nama Gelanggang
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input id="gelanggangs" name="gelanggangs" value={gelanggangs} onChange={(e) => setGelanggangs(e.target.value)} placeholder="cth: Gelanggang A, Gelanggang B" disabled={isLoading} required/>
                    <p className="text-xs text-muted-foreground mt-1">Pisahkan dengan koma untuk beberapa gelanggang.</p>
                 </div>

                <FormField
                    id="tandingAge"
                    label="Kategori Usia"
                    as="select"
                    value={tandingAge}
                    onSelectChange={setTandingAge}
                    options={ageCategories.map(cat => ({ value: cat, label: cat }))}
                    placeholder="Pilih Kategori Usia"
                    required
                />
                <FormField id="tandingClass" label="Nama Kelas Tanding" value={tandingClass} onChange={(e) => setTandingClass(e.target.value)} placeholder="cth: Kelas A Putra" disabled={isLoading} required/>
                
                <div>
                  <Label htmlFor="tandingParticipants">Jumlah Peserta (2-32)</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tandingParticipants.length - 1, setTandingParticipants)} disabled={isLoading}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id="tandingParticipants" type="number" className="text-center" value={tandingParticipants.length} onChange={(e) => handleParticipantCountChange(parseInt(e.target.value), setTandingParticipants)} disabled={isLoading} />
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tandingParticipants.length + 1, setTandingParticipants)} disabled={isLoading}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-2">
                  <h3 className="text-lg font-semibold">Data Peserta</h3>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={isLoading}>
                      <Download className="mr-2 h-4 w-4" /> Download Template
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isLoading}>
                      <Upload className="mr-2 h-4 w-4" /> Unggah Peserta (.xlsx)
                    </Button>
                  </div>
                </div>
                 <p className="text-xs text-muted-foreground mb-4">Urutan peserta di bawah ini akan menentukan penempatan unggulan (seeding). Peserta pertama adalah unggulan #1.</p>
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
                Tampilkan Pratinjau Bagan
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tgr">
           <Card className="shadow-lg bg-card text-card-foreground border-border">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">Generator Daftar Peserta TGR</CardTitle>
              <CardDescription>Masukkan detail dan daftar peserta TGR untuk membuat daftar tampil yang terstruktur.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField id="date" label="Tanggal Pertandingan" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
                 <div>
                    <Label htmlFor="gelanggangs" className="block text-sm font-medium font-headline mb-1">
                      Nama Gelanggang
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input id="gelanggangs" name="gelanggangs" value={gelanggangs} onChange={(e) => setGelanggangs(e.target.value)} placeholder="cth: Gelanggang A, Gelanggang B" disabled={isLoading} required/>
                    <p className="text-xs text-muted-foreground mt-1">Pisahkan dengan koma untuk beberapa gelanggang.</p>
                 </div>

                 <FormField
                    id="tgrAge"
                    label="Kategori Usia"
                    as="select"
                    value={tgrAge}
                    onSelectChange={setTgrAge}
                    options={ageCategories.map(cat => ({ value: cat, label: cat }))}
                    placeholder="Pilih Kategori Usia"
                    required
                  />
                  <FormField
                    id="tgrCategory"
                    label="Kategori TGR"
                    as="select"
                    value={tgrCategory}
                    onSelectChange={(v) => setTgrCategory(v as TGRCategoryType)}
                    options={tgrCategoriesList.map(cat => ({ value: cat, label: cat }))}
                    placeholder="Pilih Kategori TGR"
                    required
                  />
                <div>
                  <Label htmlFor="tgrParticipants">Jumlah Peserta/Tim</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tgrParticipants.length - 1, setTgrParticipants)} disabled={isLoading}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id="tgrParticipants" type="number" className="text-center" value={tgrParticipants.length} onChange={(e) => handleParticipantCountChange(parseInt(e.target.value), setTgrParticipants)} disabled={isLoading} />
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tgrParticipants.length + 1, setTgrParticipants)} disabled={isLoading}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
               <div className="border-t pt-4">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-2">
                    <h3 className="text-lg font-semibold">Data Peserta</h3>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={isLoading}>
                        <Download className="mr-2 h-4 w-4" /> Download Template
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isLoading}>
                        <Upload className="mr-2 h-4 w-4" /> Unggah Peserta (.xlsx)
                      </Button>
                    </div>
                  </div>
                 <p className="text-xs text-muted-foreground mb-4">Urutan akan menentukan nomor undian. Untuk Ganda/Regu, pisahkan nama dengan koma di dalam satu sel pada kolom "Nama".</p>
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
                Tampilkan Pratinjau Daftar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {generatedScheme && (
        <div className="mt-8 bg-background p-4 rounded-lg border">
            <h2 className="text-2xl font-bold text-center mb-4">Pratinjau Bagan</h2>
            <BracketView scheme={generatedScheme} />
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button onClick={handleSaveScheme} size="lg" className="bg-green-600 hover:bg-green-700 text-white" disabled={isLoading || isSchemeSaved}>
                {isLoading && !isSchemeSaved ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                {isSchemeSaved ? 'Bagan Telah Disimpan' : 'Simpan Bagan'}
              </Button>
              {isSchemeSaved && generatedScheme.type === 'Tanding' && (
                <Button onClick={handleGenerateSchedules} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={isGeneratingSchedules || schedulesGenerated}>
                  {isGeneratingSchedules ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CalendarPlus className="mr-2 h-5 w-5" />}
                  {schedulesGenerated ? 'Jadwal Telah Dibuat' : 'Jadikan Jadwal Pertandingan'}
                </Button>
              )}
               <Button onClick={() => router.push('/admin/scheme-list')} size="lg" variant="outline">
                <LayoutGrid className="mr-2 h-5 w-5"/>
                Buka Daftar Bagan
              </Button>
            </div>
        </div>
      )}
    </>
  );
}
