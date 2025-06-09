
"use client";

import { useState, type FormEvent, type ChangeEvent, useEffect, useCallback } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormField } from '@/components/admin/ScheduleFormFields';
import { ScheduleTable } from '@/components/admin/ScheduleTable';
import { PrintScheduleButton } from '@/components/admin/PrintScheduleButton';
import { Upload, PlusCircle, PlayCircle } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { TableCell } from '@/components/ui/table';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const initialFormState: Omit<ScheduleTanding, 'id'> = {
  date: new Date().toISOString().split('T')[0],
  place: '',
  pesilatMerahName: '',
  pesilatMerahContingent: '',
  pesilatBiruName: '',
  pesilatBiruContingent: '',
  round: '',
  class: '',
  matchNumber: 1,
};

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';

export default function ScheduleTandingPage() {
  const [schedules, setSchedules] = useState<ScheduleTanding[]>([]);
  const [formData, setFormData] = useState<Omit<ScheduleTanding, 'id'>>(initialFormState);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch active schedule ID
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists()) {
        setActiveScheduleId(docSnap.data()?.activeScheduleId || null);
      } else {
        setActiveScheduleId(null);
      }
    }, (error) => {
      console.error("Error fetching active schedule ID:", error);
      setActiveScheduleId(null);
    });
    return () => unsub();
  }, []);

  // Fetch all schedules
  useEffect(() => {
    setIsLoading(true);
    const unsub = onSnapshot(collection(db, SCHEDULE_TANDING_COLLECTION), (querySnapshot) => {
      const schedulesData: ScheduleTanding[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        schedulesData.push({
          id: doc.id,
          date: data.date instanceof Timestamp ? data.date.toDate().toISOString().split('T')[0] : data.date,
          place: data.place,
          pesilatMerahName: data.pesilatMerahName,
          pesilatMerahContingent: data.pesilatMerahContingent,
          pesilatBiruName: data.pesilatBiruName,
          pesilatBiruContingent: data.pesilatBiruContingent,
          round: data.round,
          class: data.class,
          matchNumber: data.matchNumber,
        });
      });
      setSchedules(schedulesData.sort((a, b) => a.matchNumber - b.matchNumber));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching schedules:", error);
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const scheduleDataForFirestore = {
      ...formData,
      date: Timestamp.fromDate(new Date(formData.date + "T00:00:00")), // Ensure local date is used
    };

    try {
      if (isEditing) {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, isEditing);
        await updateDoc(scheduleDocRef, scheduleDataForFirestore);
        setIsEditing(null);
      } else {
        const newScheduleId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const newScheduleRef = doc(db, SCHEDULE_TANDING_COLLECTION, newScheduleId);
        await setDoc(newScheduleRef, scheduleDataForFirestore);
      }
      setFormData(initialFormState);
    } catch (error) {
      console.error("Error saving schedule: ", error);
      alert(`Gagal menyimpan jadwal: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleEdit = (id: string) => {
    const scheduleToEdit = schedules.find(s => s.id === id);
    if (scheduleToEdit) {
      const formDate = scheduleToEdit.date instanceof Date 
        ? scheduleToEdit.date.toISOString().split('T')[0]
        : String(scheduleToEdit.date);

      setFormData({...scheduleToEdit, date: formDate});
      setIsEditing(id);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) {
      try {
        await deleteDoc(doc(db, SCHEDULE_TANDING_COLLECTION, id));
        if (id === activeScheduleId) {
          await setDoc(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), { activeScheduleId: null });
        }
      } catch (error) {
        console.error("Error deleting schedule: ", error);
        alert(`Gagal menghapus jadwal: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const processUploadedFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          alert('Gagal membaca file.');
          return;
        }
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length < 2) {
          alert('File XLSX kosong atau tidak memiliki header.');
          return;
        }

        const headers = jsonData[0];
        const expectedHeaders = [
          "Nomor Pertandingan", "Tanggal (YYYY-MM-DD)", "Tempat Pertandingan", 
          "Nama Pesilat Merah", "Kontingen Pesilat Merah", "Nama Pesilat Biru", 
          "Kontingen Pesilat Biru", "Babak", "Kelas Tanding"
        ];

        if (headers.length !== expectedHeaders.length || !expectedHeaders.every((eh, i) => eh === headers[i])) {
          alert('Format header file XLSX tidak sesuai template. Pastikan urutan dan nama kolom benar.');
          return;
        }

        const dataRows = jsonData.slice(1);
        let successCount = 0;
        let errorCount = 0;
        const errorMessages: string[] = [];

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          if (row.filter(cell => cell !== null && cell !== undefined && cell !== '').length === 0) {
            continue; // Skip empty rows
          }
          
          if (row.length < expectedHeaders.length) {
            errorMessages.push(`Baris ${i + 2}: Data tidak lengkap, harap isi semua kolom.`);
            errorCount++;
            continue;
          }

          const [
            matchNumStr, dateStr, place, pMerahName, pMerahCont, 
            pBiruName, pBiruCont, round, tandingClass
          ] = row;

          const matchNumber = parseInt(String(matchNumStr));
          if (isNaN(matchNumber)) {
            errorMessages.push(`Baris ${i + 2}: Nomor Pertandingan tidak valid.`);
            errorCount++;
            continue;
          }

          let parsedDate;
          if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            parsedDate = Timestamp.fromDate(new Date(dateStr + "T00:00:00"));
          } else if (typeof dateStr === 'number') { // Excel date serial number
             // XLSX library usually converts serial numbers to JS Date objects if { cellDates: true } is used.
             // If it's raw serial, we need to parse it. For aoa_to_sheet it might be raw.
             // sheet_to_json with header:1 returns raw values.
             // Excel stores dates as numbers of days since 1900-01-00.
             // JS Date is ms since 1970-01-01.
             // This conversion can be tricky. For now, strict YYYY-MM-DD string is expected.
             const excelEpoch = new Date(1899, 11, 30); // Excel's epoch starts on Dec 30, 1899 for serial 0
             const jsDate = new Date(excelEpoch.getTime() + dateStr * 24 * 60 * 60 * 1000);
             if (!isNaN(jsDate.getTime())) {
                parsedDate = Timestamp.fromDate(jsDate);
             } else {
                errorMessages.push(`Baris ${i + 2}: Format tanggal Excel (angka) tidak bisa diproses: ${dateStr}. Harap gunakan format YYYY-MM-DD.`);
                errorCount++;
                continue;
             }
          }
           else {
            errorMessages.push(`Baris ${i + 2}: Format tanggal tidak valid: ${dateStr}. Harap gunakan YYYY-MM-DD.`);
            errorCount++;
            continue;
          }

          const newScheduleData: Omit<ScheduleTanding, 'id'> = {
            matchNumber,
            date: dateStr, // Store original string for form consistency, convert to TS for Firestore
            place: String(place),
            pesilatMerahName: String(pMerahName),
            pesilatMerahContingent: String(pMerahCont),
            pesilatBiruName: String(pBiruName),
            pesilatBiruContingent: String(pBiruCont),
            round: String(round),
            class: String(tandingClass),
          };
          
          const scheduleDataForFirestore = { ...newScheduleData, date: parsedDate };

          try {
            const newScheduleId = `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
            const newScheduleRef = doc(db, SCHEDULE_TANDING_COLLECTION, newScheduleId);
            await setDoc(newScheduleRef, scheduleDataForFirestore);
            successCount++;
          } catch (dbError) {
            console.error("Error writing to Firestore: ", dbError);
            errorMessages.push(`Baris ${i + 2}: Gagal menyimpan ke database. ${dbError instanceof Error ? dbError.message : ''}`);
            errorCount++;
          }
        }

        let summaryMessage = `${successCount} jadwal berhasil diimpor.`;
        if (errorCount > 0) {
          summaryMessage += `\n${errorCount} jadwal gagal diimpor.\nKesalahan:\n${errorMessages.slice(0, 5).join('\n')}`;
          if (errorMessages.length > 5) {
            summaryMessage += `\n...dan ${errorMessages.length - 5} kesalahan lainnya.`;
          }
        }
        alert(summaryMessage);

      } catch (err) {
        console.error("Error processing file: ", err);
        alert(`Gagal memproses file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        // Reset file input value so the same file can be selected again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };


  const handleActivateSchedule = async (schedule: ScheduleTanding) => {
    try {
      await setDoc(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), { activeScheduleId: schedule.id });
      alert(`Jadwal Pertandingan No. ${schedule.matchNumber} (${schedule.pesilatMerahName} vs ${schedule.pesilatBiruName}) telah diaktifkan.`);
    } catch (error) {
      console.error("Error activating schedule: ", error);
      alert(`Gagal mengaktifkan jadwal: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const tandingTableHeaders = ["No. Match", "Tanggal", "Tempat", "Pesilat Merah", "Pesilat Biru", "Babak", "Kelas"];

  if (isLoading) {
    return <PageTitle title="Jadwal Pertandingan Tanding" description="Memuat data jadwal..."><div className="flex gap-2"><Button variant="outline" disabled><Upload className="mr-2 h-4 w-4" /> Unggah XLS</Button><PrintScheduleButton scheduleType="Tanding" disabled /></div></PageTitle>;
  }

  return (
    <>
      <PageTitle title="Jadwal Pertandingan Tanding" description="Kelola jadwal pertandingan kategori tanding.">
        <div className="flex gap-2">
           <input type="file" accept=".xlsx" ref={fileInputRef} onChange={processUploadedFile} style={{ display: 'none' }} />
          <Button onClick={handleFileUpload} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Unggah XLS
          </Button>
          <PrintScheduleButton scheduleType="Tanding" disabled={schedules.length === 0} />
        </div>
      </PageTitle>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="font-headline">{isEditing ? 'Edit Jadwal Tanding' : 'Tambah Jadwal Tanding Baru'}</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField id="matchNumber" label="Nomor Pertandingan" type="number" value={formData.matchNumber} onChange={handleChange} required />
            <FormField id="date" label="Tanggal" type="date" value={formData.date} onChange={handleChange} required />
            <FormField id="place" label="Tempat Pertandingan" value={formData.place} onChange={handleChange} required />
            
            <FormField id="pesilatMerahName" label="Nama Pesilat Merah" value={formData.pesilatMerahName} onChange={handleChange} required />
            <FormField id="pesilatMerahContingent" label="Kontingen Pesilat Merah" value={formData.pesilatMerahContingent} onChange={handleChange} required />
            
            <FormField id="pesilatBiruName" label="Nama Pesilat Biru" value={formData.pesilatBiruName} onChange={handleChange} required />
            <FormField id="pesilatBiruContingent" label="Kontingen Pesilat Biru" value={formData.pesilatBiruContingent} onChange={handleChange} required />

            <FormField id="round" label="Babak" value={formData.round} onChange={handleChange} placeholder="cth: Penyisihan, Final" required />
            <FormField id="class" label="Kelas Tanding" value={formData.class} onChange={handleChange} placeholder="cth: Kelas A Putra Dewasa" required />
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

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Daftar Jadwal Tanding</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleTable<ScheduleTanding>
            schedules={schedules}
            caption="Jadwal Pertandingan Tanding Terdaftar"
            headers={tandingTableHeaders}
            renderRow={(s) => (
              <>
                <TableCell>{s.matchNumber}</TableCell>
                <TableCell>{new Date(s.date + "T00:00:00").toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</TableCell>
                <TableCell>{s.place}</TableCell>
                <TableCell>{s.pesilatMerahName} ({s.pesilatMerahContingent})</TableCell>
                <TableCell>{s.pesilatBiruName} ({s.pesilatBiruContingent})</TableCell>
                <TableCell>{s.round}</TableCell>
                <TableCell>{s.class}</TableCell>
              </>
            )}
            onEdit={handleEdit}
            onDelete={handleDelete}
            renderCustomActions={(schedule) => (
              <>
                {schedule.id === activeScheduleId ? (
                  <Button variant="default" size="sm" disabled className="bg-green-500 hover:bg-green-600">
                    <PlayCircle className="mr-1 h-4 w-4" />
                    Jadwal Aktif
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleActivateSchedule(schedule)}>
                    <PlayCircle className="mr-1 h-4 w-4" />
                    Aktifkan Jadwal
                  </Button>
                )}
              </>
            )}
          />
        </CardContent>
      </Card>
    </>
  );
}
