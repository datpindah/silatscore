
"use client";

import { useState, type FormEvent, type ChangeEvent, useEffect, useCallback, useRef } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormField } from '@/components/admin/ScheduleFormFields';
import { ScheduleTable } from '@/components/admin/ScheduleTable';
import { PrintScheduleButton } from '@/components/admin/PrintScheduleButton';
import { Upload, PlusCircle, User, Users, UserSquare, Swords, PlayCircle, Loader2, Download } from 'lucide-react';
import type { ScheduleTGR, TGRCategoryType } from '@/lib/types';
import { tgrCategoriesList } from '@/lib/types';
import { TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, setDoc, query, orderBy, Timestamp, deleteField, where } from 'firebase/firestore';
import * as XLSX from 'xlsx'; 

const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tgr_matches_by_gelanggang';

const initialFormState: Omit<ScheduleTGR, 'id'> = {
  lotNumber: 1,
  category: 'Tunggal',
  date: new Date().toISOString().split('T')[0],
  place: '',
  round: 'Penyisihan',
  pesilatMerahName: '',
  pesilatMerahContingent: '',
  pesilatBiruName: '',
  pesilatBiruContingent: '',
};

const roundOptions = [
  { value: 'Penyisihan', label: 'Penyisihan' },
  { value: 'Perempat Final', label: 'Perempat Final' },
  { value: 'Semi Final', label: 'Semi Final' },
  { value: 'Final', label: 'Final' },
];

export default function ScheduleTGRPage() {
  const [schedules, setSchedules] = useState<ScheduleTGR[]>([]);
  const [formData, setFormData] = useState<Omit<ScheduleTGR, 'id'>>(initialFormState);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [activeTgrSchedulesByGelanggang, setActiveTgrSchedulesByGelanggang] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH), (docSnap) => {
      if (docSnap.exists()) {
        setActiveTgrSchedulesByGelanggang(docSnap.data() as Record<string, string | null>);
      } else {
        setActiveTgrSchedulesByGelanggang({});
      }
    }, (error) => {
      console.error("Error fetching active TGR schedules by gelanggang:", error);
      setActiveTgrSchedulesByGelanggang({});
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, SCHEDULE_TGR_COLLECTION), orderBy("lotNumber", "asc"));
    const unsub = onSnapshot(q, async (querySnapshot) => {
      const schedulesData: ScheduleTGR[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        let processedDate: string;
        if (data.date instanceof Timestamp) {
          processedDate = data.date.toDate().toISOString().split('T')[0];
        } else if (typeof data.date === 'string') {
          if (/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
            processedDate = data.date;
          } else {
            console.warn(`[ScheduleTGR] Malformed date string from Firestore: ${data.date}. Defaulting to today.`);
            processedDate = new Date().toISOString().split('T')[0];
          }
        } else if (data.date && typeof data.date.seconds === 'number' && typeof data.date.nanoseconds === 'number') {
          processedDate = new Date(data.date.seconds * 1000).toISOString().split('T')[0];
        } else {
          console.warn(`[ScheduleTGR] Unexpected date type from Firestore: ${typeof data.date}. Defaulting to today.`);
          processedDate = new Date().toISOString().split('T')[0];
        }

        schedulesData.push({
          id: docSnap.id,
          lotNumber: data.lotNumber,
          category: data.category as TGRCategoryType,
          date: processedDate,
          place: data.place as string,
          round: data.round as string,
          pesilatMerahName: data.pesilatMerahName as string,
          pesilatMerahContingent: data.pesilatMerahContingent as string,
          pesilatBiruName: (data.pesilatBiruName as string | undefined) || '',
          pesilatBiruContingent: (data.pesilatBiruContingent as string | undefined) || '',
        });
      });

      const finishedMatchesQuery = query(collection(db, MATCHES_TGR_COLLECTION), where("matchResult", "!=", null));
      const finishedMatchesSnap = await getDocs(finishedMatchesQuery);
      const finishedMatchIds = new Set(finishedMatchesSnap.docs.map(doc => doc.id));
      
      const unfinishedSchedules = schedulesData.filter(s => !finishedMatchIds.has(s.id));

      setSchedules(unfinishedSchedules);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching TGR schedules:", error);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);


  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }));
  };

  const handleSelectChange = (name: string) => (value: string) => {
     setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.pesilatMerahName || !formData.pesilatMerahContingent) {
        alert("Nama Pesilat Merah dan Kontingen Merah wajib diisi.");
        return;
    }
    if (!formData.date || !formData.place || formData.place.trim() === "" || !formData.round) { 
        alert("Tanggal, Gelanggang, dan Babak wajib diisi. Gelanggang tidak boleh kosong.");
        return;
    }

    const scheduleDataForFirestore = {
      ...formData,
      date: Timestamp.fromDate(new Date(formData.date + "T00:00:00")),
    };

    try {
      if (isEditing) {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, isEditing);
        await updateDoc(scheduleDocRef, scheduleDataForFirestore);
        setIsEditing(null);
      } else {
        const newScheduleId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const newScheduleRef = doc(db, SCHEDULE_TGR_COLLECTION, newScheduleId);
        await setDoc(newScheduleRef, scheduleDataForFirestore);
      }
      setFormData(initialFormState);
    } catch (error) {
      console.error("Error saving TGR schedule: ", error);
      alert(`Gagal menyimpan jadwal TGR: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleEdit = (id: string) => {
    const scheduleToEdit = schedules.find(s => s.id === id);
    if (scheduleToEdit) {
      setFormData({...scheduleToEdit });
      setIsEditing(id);
    }
  };

  const handleDelete = async (scheduleToDelete: ScheduleTGR) => {
     if (confirm(`Apakah Anda yakin ingin menghapus jadwal TGR No. ${scheduleToDelete.lotNumber} (${scheduleToDelete.pesilatMerahName}) di ${scheduleToDelete.place}?`)) {
      try {
        await deleteDoc(doc(db, SCHEDULE_TGR_COLLECTION, scheduleToDelete.id));
        if (activeTgrSchedulesByGelanggang[scheduleToDelete.place] === scheduleToDelete.id) {
            const venueMapRef = doc(db, ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH);
            await updateDoc(venueMapRef, {
                [scheduleToDelete.place]: deleteField() // Or set to null
            });
        }
      } catch (error) {
        console.error("Error deleting TGR schedule: ", error);
        alert(`Gagal menghapus jadwal TGR: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const processUploadedFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) { alert('Gagal membaca file.'); return; }
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        if (jsonData.length < 2) { alert('File XLSX kosong atau tidak memiliki header.'); return; }
        const headers = jsonData[0];
        const expectedHeaders = ["Nomor Undian", "Tanggal (YYYY-MM-DD)", "Gelanggang", "Pool/Grup", "Babak Pertandingan", "Kategori (Tunggal/Ganda/Regu)", "Nama Peserta (Pisahkan dengan koma)", "Kontingen"];
        if (headers.length !== expectedHeaders.length || !expectedHeaders.every((eh, i) => eh === headers[i])) { alert('Format header file XLSX jadwal TGR tidak sesuai template.'); return; }
        const dataRows = jsonData.slice(1);
        let successCount = 0; let errorCount = 0; const errorMessages: string[] = [];
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          if (row.filter(cell => cell !== null && cell !== undefined && cell !== '').length === 0) continue;
          if (row.length < expectedHeaders.length) { errorMessages.push(`Baris ${i + 2}: Data tidak lengkap.`); errorCount++; continue; }
          const [lotNumStr, dateStr, place, poolGroup, round, category, participantNames, contingent] = row;
          if (!place || String(place).trim() === "") { errorMessages.push(`Baris ${i + 2}: Gelanggang kosong.`); errorCount++; continue; }
          const lotNumber = parseInt(String(lotNumStr));
          if (isNaN(lotNumber)) { errorMessages.push(`Baris ${i + 2}: Nomor Undian tidak valid.`); errorCount++; continue; }
          let parsedDate; let originalDateStrForForm: string;
          if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { parsedDate = Timestamp.fromDate(new Date(dateStr + "T00:00:00")); originalDateStrForForm = dateStr; }
          else if (typeof dateStr === 'number') { const excelEpoch = new Date(1899, 11, 30); const jsDate = new Date(excelEpoch.getTime() + dateStr * 24 * 60 * 60 * 1000); if (!isNaN(jsDate.getTime())) { parsedDate = Timestamp.fromDate(jsDate); originalDateStrForForm = jsDate.toISOString().split('T')[0]; } else { errorMessages.push(`Baris ${i + 2}: Format tanggal Excel tidak valid: ${dateStr}.`); errorCount++; continue; }}
          else { errorMessages.push(`Baris ${i + 2}: Format tanggal tidak valid: ${dateStr}. Harap YYYY-MM-DD.`); errorCount++; continue; }
          const names = String(participantNames).split(',').map(name => name.trim());
          const pesilatMerahName = names[0] || '';
          const pesilatBiruName = names[1] || ''; // Ganda might have a second name here

          const newScheduleData: Omit<ScheduleTGR, 'id'> = { lotNumber, category: category as TGRCategoryType, date: originalDateStrForForm, place: String(place), round: String(round), pesilatMerahName, pesilatMerahContingent: String(contingent), pesilatBiruName, pesilatBiruContingent: pesilatBiruName ? String(contingent) : ''}; // Assume same contingent if biru name exists
          const scheduleDataForFirestore = { ...newScheduleData, date: parsedDate };
          try { const newScheduleId = `${Date.now()}-tgr-${i}-${Math.random().toString(36).substring(2, 9)}`; const newScheduleRef = doc(db, SCHEDULE_TGR_COLLECTION, newScheduleId); await setDoc(newScheduleRef, scheduleDataForFirestore); successCount++; }
          catch (dbError) { console.error("Error writing TGR to Firestore: ", dbError); errorMessages.push(`Baris ${i + 2}: Gagal menyimpan. ${dbError instanceof Error ? dbError.message : ''}`); errorCount++; }
        }
        let summaryMessage = `${successCount} jadwal TGR berhasil diimpor.`; if (errorCount > 0) { summaryMessage += `\n${errorCount} jadwal TGR gagal.\nKesalahan:\n${errorMessages.slice(0, 5).join('\n')}`; if (errorMessages.length > 5) summaryMessage += `\n...dan ${errorMessages.length - 5} lainnya.`; } alert(summaryMessage);
      } catch (err) { console.error("Error processing TGR file: ", err); alert(`Gagal memproses file TGR: ${err instanceof Error ? err.message : String(err)}`); }
      finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
    };
    reader.readAsArrayBuffer(file);
  };


  const handleActivateTGRSchedule = async (schedule: ScheduleTGR) => {
    if (!schedule.place || schedule.place.trim() === "") {
      alert("Tidak dapat mengaktifkan jadwal TGR: Tempat Pertandingan (Gelanggang) kosong.");
      return;
    }
    const venue = schedule.place;
    const scheduleIdToActivate = schedule.id;

    try {
      const venueMapRef = doc(db, ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH);
      await setDoc(venueMapRef, { [venue]: scheduleIdToActivate }, { merge: true });
      alert(`Jadwal TGR No. ${schedule.lotNumber} (${schedule.pesilatMerahName}) telah diaktifkan untuk Gelanggang: ${venue}.`);
    } catch (error) {
      console.error("Error activating TGR schedule: ", error);
      alert(`Gagal mengaktifkan jadwal TGR: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDownloadTGRTemplate = () => {
    const fileName = "Template_Jadwal_TGR.xlsx";
    const headers = [
      "Nomor Undian",
      "Tanggal (YYYY-MM-DD)",
      "Gelanggang",
      "Pool/Grup",
      "Babak Pertandingan",
      "Kategori (Tunggal/Ganda/Regu)",
      "Nama Peserta (Pisahkan dengan koma)",
      "Kontingen"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const colWidths = headers.map(header => ({ wch: header.length + 5 }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jadwal TGR");
    XLSX.writeFile(wb, fileName);
    alert("Mengunduh template XLSX jadwal TGR.");
  };

  const tableHeaders = ["No. Partai/Undian", "Tanggal", "Gelanggang", "Babak", "Kategori", "Pesilat Merah", "Kontingen Merah", "Pesilat Biru", "Kontingen Biru"];

  const categoryIcons: Record<TGRCategoryType, React.ReactNode> = {
    Tunggal: <User className="h-4 w-4 inline mr-1" />,
    Ganda: <Users className="h-4 w-4 inline mr-1" />,
    Regu: <UserSquare className="h-4 w-4 inline mr-1" />,
    'Jurus Tunggal Bebas': <Swords className="h-4 w-4 inline mr-1" />,
  };
  
  const schedulesByGelanggang = schedules.reduce((acc, schedule) => {
    const { place } = schedule;
    if (!acc[place]) {
      acc[place] = [];
    }
    acc[place].push(schedule);
    return acc;
  }, {} as Record<string, ScheduleTGR[]>);

  const sortedGelanggangs = Object.keys(schedulesByGelanggang).sort((a, b) => a.localeCompare(b));


  if (isLoading) {
    return (
      <>
        <PageTitle title="Jadwal Pertandingan TGR" description="Memuat data jadwal TGR...">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownloadTGRTemplate} variant="outline" disabled className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Download className="mr-2 h-4 w-4" /> Download Template
            </Button>
            <input type="file" accept=".xlsx" ref={fileInputRef} onChange={processUploadedFile} style={{ display: 'none' }} />
            <Button onClick={handleFileUpload} variant="outline" disabled><Upload className="mr-2 h-4 w-4" /> Unggah XLS</Button>
            <PrintScheduleButton scheduleType="TGR" disabled />
          </div>
        </PageTitle>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Jadwal Pertandingan TGR" description="Kelola jadwal pertandingan kategori Tunggal, Ganda, Regu, dan Jurus Tunggal Bebas.">
        <div className="flex flex-wrap gap-2">
           <Button onClick={handleDownloadTGRTemplate} variant="outline" className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Download className="mr-2 h-4 w-4" /> Download Template
          </Button>
          <input type="file" accept=".xlsx" ref={fileInputRef} onChange={processUploadedFile} style={{ display: 'none' }} />
          <Button onClick={handleFileUpload} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Unggah XLS TGR
          </Button>
          <PrintScheduleButton scheduleType="TGR" disabled={schedules.length === 0} />
        </div>
      </PageTitle>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="font-headline">{isEditing ? 'Edit Jadwal TGR' : 'Tambah Jadwal TGR Baru'}</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField id="lotNumber" label="No. Partai/Undian" type="number" value={formData.lotNumber} onChange={handleChange} required />
            <FormField id="date" label="Tanggal" type="date" value={formData.date} onChange={handleChange} required />
            <FormField id="place" label="Gelanggang" value={formData.place} onChange={handleChange} placeholder="cth: Gelanggang C" required />
            <FormField
              id="round"
              label="Babak"
              as="select"
              value={formData.round}
              onSelectChange={handleSelectChange('round')}
              options={roundOptions}
              placeholder="Pilih Babak"
              required
            />
            <FormField
              id="category"
              label="Kategori"
              as="select"
              value={formData.category}
              onSelectChange={handleSelectChange('category')}
              options={tgrCategoriesList.map(cat => ({ value: cat, label: cat }))}
              required
            />
            <FormField id="pesilatMerahName" label="Nama Pesilat Merah" value={formData.pesilatMerahName} onChange={handleChange} placeholder="Nama pesilat/tim utama" required />
            <FormField id="pesilatMerahContingent" label="Kontingen Pesilat Merah" value={formData.pesilatMerahContingent} onChange={handleChange} required />
            <FormField id="pesilatBiruName" label="Nama Pesilat Biru (Opsional)" value={formData.pesilatBiruName || ''} onChange={handleChange} placeholder="Kosongkan jika tidak relevan" />
            <FormField id="pesilatBiruContingent" label="Kontingen Pesilat Biru (Opsional)" value={formData.pesilatBiruContingent || ''} onChange={handleChange} />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <PlusCircle className="mr-2 h-4 w-4" /> {isEditing ? 'Simpan Perubahan' : 'Tambah Jadwal'}
            </Button>
             {isEditing && (
              <Button type="button" variant="outline" onClick={() => { setIsEditing(null); setFormData(initialFormState); }} className="ml-2">
                Batal
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>

      {sortedGelanggangs.length > 0 ? (
        sortedGelanggangs.map((gelanggang) => (
          <Card key={gelanggang} className="mb-8">
            <CardHeader>
              <CardTitle className="font-headline">Daftar Jadwal - Gelanggang: {gelanggang}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScheduleTable<ScheduleTGR>
                schedules={schedulesByGelanggang[gelanggang]}
                caption={`Jadwal Pertandingan TGR Terdaftar untuk Gelanggang ${gelanggang}`}
                headers={tableHeaders}
                renderRow={(s) => [
                    <TableCell key={`lotNumber-${s.id}`}>{s.lotNumber}</TableCell>,
                    <TableCell key={`date-${s.id}`}>{new Date(s.date + "T00:00:00").toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</TableCell>,
                    <TableCell key={`place-${s.id}`}>{s.place}</TableCell>,
                    <TableCell key={`round-${s.id}`}>{s.round}</TableCell>,
                    <TableCell key={`category-${s.id}`} className="flex items-center">
                      {categoryIcons[s.category]} {s.category}
                    </TableCell>,
                    <TableCell key={`merahName-${s.id}`}>{s.pesilatMerahName || 'N/A'}</TableCell>,
                    <TableCell key={`merahCont-${s.id}`}>{s.pesilatMerahContingent || 'N/A'}</TableCell>,
                    <TableCell key={`biruName-${s.id}`}>{s.pesilatBiruName || 'N/A'}</TableCell>,
                    <TableCell key={`biruCont-${s.id}`}>{s.pesilatBiruContingent || 'N/A'}</TableCell>,
                ]}
                onEdit={handleEdit}
                onDelete={(id) => {
                     const scheduleToDelete = schedules.find(s => s.id === id);
                     if (scheduleToDelete) handleDelete(scheduleToDelete);
                }}
                renderCustomActions={(schedule) => (
                  <>
                    {activeTgrSchedulesByGelanggang[schedule.place] === schedule.id ? (
                      <Button variant="default" size="sm" disabled className="bg-green-500 hover:bg-green-600">
                        <PlayCircle className="mr-1 h-4 w-4" />
                        Aktif di {schedule.place}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleActivateTGRSchedule(schedule)} disabled={!schedule.place || schedule.place.trim() === ""}>
                        <PlayCircle className="mr-1 h-4 w-4" />
                        Aktifkan
                      </Button>
                    )}
                  </>
                )}
              />
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Daftar Jadwal TGR</CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-center text-muted-foreground py-4">Belum ada jadwal yang ditambahkan atau semua pertandingan telah selesai.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
