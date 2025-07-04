
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
    if (finalParticipants.length < 3) {
        alert("Dibutuhkan minimal 3 peserta yang valid.");
        return;
    }

    setIsLoading(true);
    setGeneratedScheme(null);
    
    // Simulate processing delay for complex brackets
    setTimeout(() => {
        try {
            const participantsWithSeed: SchemeParticipant[] = finalParticipants.map((p, index) => ({
              id: `p-${index + 1}`,
              name: p.name,
              contingent: p.contingent,
              seed: index + 1
            }));

            const numParticipants = participantsWithSeed.length;
            const bracketSize = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
            const numByes = bracketSize - numParticipants;
            const numPlayInMatches = numParticipants - bracketSize / 2;

            const allRounds: SchemeRound[] = [];
            let matchCounter = 1;

            let currentCompetitors: (SchemeParticipant | null)[] = [...participantsWithSeed];
            
            // --- Round 1: Play-in matches for non-power-of-2 numbers ---
            if (numPlayInMatches > 0) {
              const playInRound: SchemeRound = { roundNumber: 1, name: "Babak Penyisihan", matches: [] };
              const byes = participantsWithSeed.slice(0, numByes);
              const players = participantsWithSeed.slice(numByes);
              
              const nextRoundCompetitors: (SchemeParticipant | null)[] = [...byes];

              for (let i = 0; i < numPlayInMatches; i++) {
                const match: SchemeMatch = {
                  id: `r1-m${i + 1}`,
                  round: 1,
                  matchNumber: matchCounter++,
                  participant1: players[i],
                  participant2: players[players.length - 1 - i],
                  winnerId: null,
                  nextMatchId: null // will be set later
                };
                playInRound.matches.push(match);
                nextRoundCompetitors.push(null); // Placeholder for winner
              }
              allRounds.push(playInRound);
              currentCompetitors = nextRoundCompetitors;
            }

            // --- Subsequent rounds ---
            let roundNum = allRounds.length + 1;
            while(currentCompetitors.length > 1) {
              const nextRoundCompetitors: (SchemeParticipant | null)[] = [];
              const roundMatches: SchemeMatch[] = [];
              
              for (let i = 0; i < currentCompetitors.length; i += 2) {
                const match: SchemeMatch = {
                  id: `r${roundNum}-m${(i/2) + 1}`,
                  round: roundNum,
                  matchNumber: matchCounter++,
                  participant1: currentCompetitors[i],
                  participant2: currentCompetitors[i+1],
                  winnerId: null,
                  nextMatchId: null
                };
                
                // Handle BYEs automatically
                if(match.participant2 === undefined) { // Odd number of competitors, last one gets a bye
                  match.participant2 = null;
                }
                if (match.participant2 === null) {
                  match.winnerId = match.participant1?.id ?? null;
                }
                
                roundMatches.push(match);
                nextRoundCompetitors.push(null); // Placeholder for the winner
              }
              
              let roundName;
              switch (roundMatches.length) {
                case 1: roundName = "Final"; break;
                case 2: roundName = "Semi Final"; break;
                case 4: roundName = "Perempat Final"; break;
                case 8: roundName = "Babak 16 Besar"; break;
                case 16: roundName = "Babak 32 Besar"; break;
                default: roundName = `Babak ${roundMatches.length * 2} Besar`;
              }

              allRounds.push({ roundNumber: roundNum, name: roundName, matches: roundMatches });
              currentCompetitors = nextRoundCompetitors;
              roundNum++;
            }

            // Link matches to their next match
            for (let i = 0; i < allRounds.length - 1; i++) {
              const currentRound = allRounds[i];
              const nextRound = allRounds[i+1];
              for(let j = 0; j < currentRound.matches.length; j++){
                currentRound.matches[j].nextMatchId = nextRound.matches[Math.floor(j/2)].id;
              }
            }
            
            const newScheme: Scheme = {
                id: `tanding-${tandingAge.replace(/\s+/g, '_').toLowerCase()}-${tandingClass.replace(/\s+/g, '_').toLowerCase()}-${Date.now()}`,
                type: 'Tanding',
                ageCategory: tandingAge,
                tandingClass: tandingClass.trim(),
                gelanggangs: gelanggangList,
                date: eventDate,
                participantCount: numParticipants,
                participants: participantsWithSeed,
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
    }, 500); // 500ms delay to show loading state
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

            const scheduleDocRef = doc(db, 'schedules_tanding', match.id);
            
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
              matchInternalId: match.id,
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
                  <Label htmlFor="tandingParticipants">Jumlah Peserta (3-32)</Label>
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
