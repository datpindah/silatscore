
"use client";

import { useState, type FormEvent, type ChangeEvent, useEffect, useCallback } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormField } from '@/components/admin/ScheduleFormFields';
import { ScheduleTable } from '@/components/admin/ScheduleTable';
import { PrintScheduleButton } from '@/components/admin/PrintScheduleButton';
import { Upload, PlusCircle, User, Users, UserSquare, Swords, PlayCircle, Loader2 } from 'lucide-react';
import type { ScheduleTGR, TGRCategoryType } from '@/lib/types';
import { tgrCategoriesList } from '@/lib/types';
import { TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, onSnapshot, setDoc, query, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx'; // Keep for future upload functionality

const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';

const initialFormState: Omit<ScheduleTGR, 'id'> = {
  lotNumber: 1,
  category: 'Tunggal',
  pesilatMerahName: '',
  pesilatMerahContingent: '',
  pesilatBiruName: '',
  pesilatBiruContingent: '',
};

export default function ScheduleTGRPage() {
  const [schedules, setSchedules] = useState<ScheduleTGR[]>([]);
  const [formData, setFormData] = useState<Omit<ScheduleTGR, 'id'>>(initialFormState);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [activeTgrScheduleId, setActiveTgrScheduleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // const fileInputRef = useRef<HTMLInputElement>(null); // For XLS upload in future

  // Fetch active TGR schedule ID
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists()) {
        setActiveTgrScheduleId(docSnap.data()?.activeScheduleId || null);
      } else {
        setActiveTgrScheduleId(null);
      }
    }, (error) => {
      console.error("Error fetching active TGR schedule ID:", error);
      setActiveTgrScheduleId(null);
    });
    return () => unsub();
  }, []);

  // Fetch all TGR schedules
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, SCHEDULE_TGR_COLLECTION), orderBy("lotNumber", "asc"));
    const unsub = onSnapshot(q, (querySnapshot) => {
      const schedulesData: ScheduleTGR[] = [];
      querySnapshot.forEach((doc) => {
        schedulesData.push({ id: doc.id, ...doc.data() } as ScheduleTGR);
      });
      setSchedules(schedulesData);
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
     setFormData(prev => ({ ...prev, [name]: value as TGRCategoryType }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Basic validation (can be expanded)
    if (!formData.pesilatMerahName || !formData.pesilatMerahContingent) {
        alert("Nama Pesilat Merah dan Kontingen Merah wajib diisi.");
        return;
    }

    const scheduleDataForFirestore = { ...formData };

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
      setFormData({...scheduleToEdit}); // The id is not part of Omit<ScheduleTGR, 'id'>
      setIsEditing(id);
    }
  };

  const handleDelete = async (id: string) => {
     if (confirm('Apakah Anda yakin ingin menghapus jadwal TGR ini?')) {
      try {
        await deleteDoc(doc(db, SCHEDULE_TGR_COLLECTION, id));
        if (id === activeTgrScheduleId) {
          await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: null });
        }
      } catch (error) {
        console.error("Error deleting TGR schedule: ", error);
        alert(`Gagal menghapus jadwal TGR: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const handleFileUpload = () => {
    alert('Fungsi unggah XLS untuk TGR belum diimplementasikan.');
    // fileInputRef.current?.click();
  };

  // const processUploadedFile = async (event: ChangeEvent<HTMLInputElement>) => { /* ... placeholder for XLS processing ... */ };


  const handleActivateTGRSchedule = async (schedule: ScheduleTGR) => {
    try {
      await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: schedule.id });
      alert(`Jadwal TGR No. ${schedule.lotNumber} (${schedule.pesilatMerahName}) telah diaktifkan.`);
    } catch (error) {
      console.error("Error activating TGR schedule: ", error);
      alert(`Gagal mengaktifkan jadwal TGR: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const tableHeaders = ["No. Partai/Undian", "Kategori", "Pesilat Merah", "Kontingen Merah", "Pesilat Biru", "Kontingen Biru"];
  
  const categoryIcons: Record<TGRCategoryType, React.ReactNode> = {
    Tunggal: <User className="h-4 w-4 inline mr-1" />,
    Ganda: <Users className="h-4 w-4 inline mr-1" />,
    Regu: <UserSquare className="h-4 w-4 inline mr-1" />,
    'Jurus Tunggal Bebas': <Swords className="h-4 w-4 inline mr-1" />,
  };

  if (isLoading) {
    return (
      <>
        <PageTitle title="Jadwal Pertandingan TGR" description="Memuat data jadwal TGR...">
          <div className="flex gap-2">
            <Button variant="outline" disabled><Upload className="mr-2 h-4 w-4" /> Unggah XLS</Button>
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
        <div className="flex gap-2">
          {/* <input type="file" accept=".xlsx" ref={fileInputRef} onChange={processUploadedFile} style={{ display: 'none' }} /> */}
          <Button onClick={handleFileUpload} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Unggah XLS
          </Button>
          <PrintScheduleButton scheduleType="TGR" disabled={schedules.length === 0} />
        </div>
      </PageTitle>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="font-headline">{isEditing ? 'Edit Jadwal TGR' : 'Tambah Jadwal TGR Baru'}</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField id="lotNumber" label="No. Partai/Undian" type="number" value={formData.lotNumber} onChange={handleChange} required />
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
            <FormField id="pesilatBiruName" label="Nama Pesilat Biru (Opsional)" value={formData.pesilatBiruName || ''} onChange={handleChange} placeholder="Kosongkan jika tidak ada lawan langsung" />
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

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Daftar Jadwal TGR</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleTable<ScheduleTGR>
            schedules={schedules}
            caption="Jadwal Pertandingan TGR Terdaftar"
            headers={tableHeaders}
            renderRow={(s) => (
              <>
                <TableCell>{s.lotNumber}</TableCell>
                <TableCell className="flex items-center">
                  {categoryIcons[s.category]} {s.category}
                </TableCell>
                <TableCell>{s.pesilatMerahName || 'N/A'}</TableCell>
                <TableCell>{s.pesilatMerahContingent || 'N/A'}</TableCell>
                <TableCell>{s.pesilatBiruName || 'N/A'}</TableCell>
                <TableCell>{s.pesilatBiruContingent || 'N/A'}</TableCell>
              </>
            )}
            onEdit={handleEdit}
            onDelete={handleDelete}
            renderCustomActions={(schedule) => (
              <>
                {schedule.id === activeTgrScheduleId ? (
                  <Button variant="default" size="sm" disabled className="bg-green-500 hover:bg-green-600">
                    <PlayCircle className="mr-1 h-4 w-4" />
                    Jadwal Aktif
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleActivateTGRSchedule(schedule)}>
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

    