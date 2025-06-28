
"use client";

import { useState, useCallback, useRef } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitBranch, Users, Minus, Plus, Loader2, Upload, Download, CalendarPlus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp, writeBatch, collection } from 'firebase/firestore';
import { ageCategories, tgrCategoriesList, type TGRCategoryType, type Scheme, type SchemeParticipant, type SchemeRound, type SchemeMatch, type ScheduleTanding, type ScheduleTGR } from '@/lib/types';
import * as XLSX from 'xlsx';
import { BracketView } from '@/components/admin/BracketView';
import { FormField } from '@/components/admin/ScheduleFormFields';

interface Participant {
  name: string;
  contingent: string;
}

const roundOptions = [
  { value: 'Penyisihan', label: 'Penyisihan' },
  { value: 'Babak 32 Besar', label: 'Babak 32 Besar' },
  { value: 'Babak 16 Besar', label: 'Babak 16 Besar' },
  { value: 'Perempat Final', label: 'Perempat Final' },
  { value: 'Semi Final', label: 'Semi Final' },
  { value: 'Final', label: 'Final' },
];

export default function SchemeManagementPage() {
  const [activeTab, setActiveTab] = useState('tanding');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generatedScheme, setGeneratedScheme] = useState<Scheme | null>(null);

  // General State
  const [gelanggang, setGelanggang] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [eventRound, setEventRound] = useState('Penyisihan');


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
    const clampedCount = Math.max(2, isNaN(newCount) ? 2 : newCount);
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
  
  const handleDownloadTemplate = () => {
    const headers = ["Nama", "Kontingen"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = [{ wch: 35 }, { wch: 35 }]; // Set column widths
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
  
  const getRoundName = (numParticipantsInRound: number): string => {
    if (numParticipantsInRound <= 2) return "Final";
    if (numParticipantsInRound <= 4) return "Semi Final";
    if (numParticipantsInRound <= 8) return "Perempat Final";
    if (numParticipantsInRound <= 16) return "Babak 16 Besar";
    if (numParticipantsInRound <= 32) return "Babak 32 Besar";
    if (numParticipantsInRound <= 64) return "Babak 64 Besar";
    return `Penyisihan (${numParticipantsInRound} Peserta)`;
  };

  const handleGenerateTandingScheme = async () => {
    if (!tandingClass.trim() || !gelanggang.trim() || !eventDate || !eventRound) {
      alert("Nama Kelas, Gelanggang, Tanggal, dan Babak tidak boleh kosong.");
      return;
    }
    if (tandingParticipants.some(p => !p.name.trim() || !p.contingent.trim())) {
      alert("Semua Nama Peserta dan Kontingen Tanding harus diisi.");
      return;
    }
    setIsLoading(true);
    setGeneratedScheme(null);

    try {
        const initialParticipants = [...tandingParticipants];
        const numParticipants = initialParticipants.length;

        if (numParticipants < 2) {
            alert("Membutuhkan setidaknya 2 peserta untuk membuat bagan.");
            setIsLoading(false);
            return;
        }

        const rounds: SchemeRound[] = [];
        let globalMatchCounter = 1;

        const bracketSize = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
        const numByes = bracketSize - numParticipants;
        
        let competitors: (Participant | { name: string; contingent: string } | null)[] = [...initialParticipants];
        let roundNumber = 1;

        if (numByes > 0) {
            const prelimRoundName = getRoundName(bracketSize);
            const prelimMatches: SchemeMatch[] = [];
            const nextRoundCompetitors: (Participant | { name: string; contingent: string } | null)[] = [];
            
            const participantsWithByes = competitors.slice(0, numByes);
            const participantsInPrelim = competitors.slice(numByes);

            nextRoundCompetitors.push(...participantsWithByes); // Byes advance directly

            for (let i = 0; i < participantsInPrelim.length; i += 2) {
                const p1 = participantsInPrelim[i];
                const p2 = participantsInPrelim[i + 1];
                const match: SchemeMatch = {
                    matchInternalId: `R${roundNumber}-M${globalMatchCounter}`,
                    globalMatchNumber: globalMatchCounter,
                    roundName: prelimRoundName,
                    participant1: p1,
                    participant2: p2,
                    winnerToMatchId: null,
                    status: 'PENDING',
                };
                prelimMatches.push(match);
                nextRoundCompetitors.push({ name: `(Pemenang Partai ${globalMatchCounter})`, contingent: '' });
                globalMatchCounter++;
            }
            if (prelimMatches.length > 0) {
                rounds.push({ roundNumber, name: prelimRoundName, matches: prelimMatches });
            }
            competitors = nextRoundCompetitors;
            roundNumber++;
        }
        
        // Loop to create main rounds until there is only one winner
        while (competitors.length > 1) {
            const roundName = getRoundName(competitors.length);
            const matchesForThisRound: SchemeMatch[] = [];
            const nextRoundCompetitors: ({ name: string; contingent: string })[] = [];
            
            // Re-seed competitors for this round to ensure fair matches
            const highSeeds = competitors.slice(0, competitors.length / 2);
            const lowSeeds = competitors.slice(competitors.length / 2).reverse();

            for (let i = 0; i < highSeeds.length; i++) {
                const p1 = highSeeds[i];
                const p2 = lowSeeds[i];
                
                const match: SchemeMatch = {
                    matchInternalId: `R${roundNumber}-M${globalMatchCounter}`,
                    globalMatchNumber: globalMatchCounter,
                    roundName: roundName,
                    participant1: p1,
                    participant2: p2,
                    winnerToMatchId: null,
                    status: 'PENDING',
                };
                matchesForThisRound.push(match);
                nextRoundCompetitors.push({ name: `(Pemenang Partai ${globalMatchCounter})`, contingent: '' });
                globalMatchCounter++;
            }
            
            if (matchesForThisRound.length > 0) {
                rounds.push({ roundNumber, name: roundName, matches: matchesForThisRound });
            }
            competitors = nextRoundCompetitors;
            roundNumber++;
        }

        const safeAge = tandingAge.replace(/\s+/g, '_').toLowerCase();
        const safeClass = tandingClass.replace(/\s+/g, '_').toLowerCase();
        const schemeId = `tanding-${safeAge}-${safeClass}-${Date.now()}`;

        const finalSchemeParticipants: SchemeParticipant[] = tandingParticipants.map((p, i) => ({
            id: `${p.contingent}-${p.name}-${i}`.replace(/\s+/g, '-'),
            name: p.name,
            contingent: p.contingent,
            seed: i + 1,
        }));

        const newScheme: Scheme = {
            id: schemeId,
            type: 'Tanding',
            ageCategory: tandingAge,
            tandingClass: tandingClass,
            gelanggang: gelanggang.trim(),
            date: eventDate,
            round: eventRound,
            participantCount: numParticipants,
            participants: finalSchemeParticipants,
            rounds: rounds,
            createdAt: Timestamp.now(),
        };

        await setDoc(doc(db, "schemes", schemeId), newScheme);
        alert(`Skema Tanding untuk ${tandingClass} (${tandingAge}) dengan ${numParticipants} peserta berhasil dibuat!`);
        setGeneratedScheme(newScheme);

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
     if (!gelanggang.trim() || !eventDate || !eventRound) {
      alert("Gelanggang, Tanggal, dan Babak tidak boleh kosong.");
      return;
    }
    setIsLoading(true);
    setGeneratedScheme(null);
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
        date: eventDate,
        round: eventRound,
        participantCount: tgrParticipantCount,
        participants: schemeParticipants,
        rounds: [], // TGR doesn't use bracket rounds in this model
        createdAt: Timestamp.now(),
      };

      await setDoc(doc(db, "schemes", schemeId), newScheme);
      alert(`Daftar Peserta TGR untuk ${tgrCategory} (${tgrAge}) dengan ${tgrParticipantCount} peserta berhasil disimpan.`);
      setGeneratedScheme(newScheme);

    } catch(err) {
      console.error("Error generating TGR scheme:", err);
      alert(`Gagal membuat daftar peserta TGR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  const handleGenerateSchedule = async () => {
      if (!generatedScheme) {
        alert("Silakan buat skema terlebih dahulu.");
        return;
      }
      setIsGeneratingSchedule(true);
      try {
        const batch = writeBatch(db);
        if (generatedScheme.type === 'Tanding') {
          if (!generatedScheme.rounds || generatedScheme.rounds.length === 0) {
            alert("Skema Tanding tidak memiliki pertandingan untuk dijadwalkan.");
            return;
          }
          
          let generatedCount = 0;
          generatedScheme.rounds.forEach(round => {
            round.matches.forEach(match => {
                // Only create schedules for matches with two actual participants
                if (!match.participant1 || !match.participant2 || match.participant1.name.startsWith('(') || match.participant2.name.startsWith('(') ) return;

                const scheduleData: Omit<ScheduleTanding, 'id'> = {
                    matchNumber: match.globalMatchNumber,
                    date: generatedScheme.date,
                    place: generatedScheme.gelanggang,
                    round: match.roundName, 
                    class: generatedScheme.tandingClass || '',
                    pesilatMerahName: match.participant1.name,
                    pesilatMerahContingent: match.participant1.contingent,
                    pesilatBiruName: match.participant2.name,
                    pesilatBiruContingent: match.participant2.contingent,
                };
                
                const scheduleDocRef = doc(collection(db, 'schedules_tanding'));
                batch.set(scheduleDocRef, {
                    ...scheduleData,
                    date: Timestamp.fromDate(new Date(scheduleData.date + "T00:00:00")),
                });
                generatedCount++;
            });
          });

          if(generatedCount === 0) {
            alert("Tidak ada pertandingan babak awal yang dapat dijadwalkan secara otomatis dari skema ini. Anda mungkin perlu membuat jadwal secara manual untuk babak selanjutnya.");
          } else {
            await batch.commit();
            alert(`${generatedCount} jadwal Tanding berhasil dibuat dan ditambahkan ke halaman Jadwal Tanding!`);
          }
        
        } else { // TGR
          generatedScheme.participants.forEach((participant, index) => {
             const scheduleData: Omit<ScheduleTGR, 'id'> = {
                lotNumber: participant.seed || index + 1,
                category: generatedScheme.tgrCategory || 'Tunggal',
                date: generatedScheme.date,
                place: generatedScheme.gelanggang,
                round: generatedScheme.round,
                pesilatMerahName: participant.name,
                pesilatMerahContingent: participant.contingent,
                pesilatBiruName: '',
                pesilatBiruContingent: '',
            };
            const scheduleDocRef = doc(collection(db, 'schedules_tgr'));
            batch.set(scheduleDocRef, {
              ...scheduleData,
              date: Timestamp.fromDate(new Date(scheduleData.date + "T00:00:00")),
            });
          });
          await batch.commit();
          alert(`${generatedScheme.participants.length} jadwal TGR berhasil dibuat dan ditambahkan ke halaman Jadwal TGR!`);
        }
      } catch (err) {
        console.error("Error generating schedule:", err);
        alert(`Gagal membuat jadwal: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsGeneratingSchedule(false);
      }
    };


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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField id="date" label="Tanggal Pertandingan" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
                <FormField
                  id="round"
                  label="Babak Awal"
                  as="select"
                  value={eventRound}
                  onSelectChange={setEventRound}
                  options={roundOptions}
                  placeholder="Pilih Babak"
                  required
                />
                 <FormField id="gelanggangTanding" label="Gelanggang" value={gelanggang} onChange={(e) => setGelanggang(e.target.value)} placeholder="cth: Gelanggang A" disabled={isLoading} required/>

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
                  <Label htmlFor="tandingParticipants">Jumlah Peserta</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tandingParticipantCount - 1, setTandingParticipantCount, setTandingParticipants)} disabled={isLoading}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id="tandingParticipants" type="number" className="text-center" value={tandingParticipantCount} onChange={(e) => handleParticipantCountChange(parseInt(e.target.value), setTandingParticipantCount, setTandingParticipants)} disabled={isLoading} />
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tandingParticipantCount + 1, setTandingParticipantCount, setTandingParticipants)} disabled={isLoading}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
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
                 <p className="text-xs text-muted-foreground mb-2">Urutan peserta di bawah ini akan menentukan penempatan unggulan (seeding). Peserta pertama adalah unggulan #1.</p>
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
                Buat Skema Bagan Tanding
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField id="date" label="Tanggal Pertandingan" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
                <FormField
                  id="round"
                  label="Babak Awal"
                  as="select"
                  value={eventRound}
                  onSelectChange={setEventRound}
                  options={roundOptions}
                  placeholder="Pilih Babak"
                  required
                />
                 <FormField id="gelanggangTgr" label="Gelanggang" value={gelanggang} onChange={(e) => setGelanggang(e.target.value)} placeholder="cth: Gelanggang B" disabled={isLoading} required/>

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
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tgrParticipantCount - 1, setTgrParticipantCount, setTgrParticipants)} disabled={isLoading}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id="tgrParticipants" type="number" className="text-center" value={tgrParticipantCount} onChange={(e) => handleParticipantCountChange(parseInt(e.target.value), setTgrParticipantCount, setTgrParticipants)} disabled={isLoading} />
                    <Button variant="outline" size="icon" onClick={() => handleParticipantCountChange(tgrParticipantCount + 1, setTgrParticipantCount, setTgrParticipants)} disabled={isLoading}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
               <div className="border-t pt-4">
                 <div className="flex justify-between items-center mb-2">
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
                 <p className="text-xs text-muted-foreground mb-2">Urutan akan menentukan nomor undian. Untuk Ganda/Regu, pisahkan nama dengan koma di dalam satu sel pada kolom "Nama".</p>
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

      {generatedScheme && (
        <div className="mt-8">
            <BracketView scheme={generatedScheme} />
            <div className="mt-4 text-center">
                <Button onClick={handleGenerateSchedule} disabled={isGeneratingSchedule} className="bg-green-600 hover:bg-green-700 text-white">
                    {isGeneratingSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
                    Generate Jadwal dari Skema Ini
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                    Aksi ini akan membuat jadwal pertandingan babak pertama di halaman Jadwal Tanding/TGR.
                </p>
            </div>
        </div>
      )}
    </>
  );
}
