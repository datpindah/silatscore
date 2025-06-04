
"use client";

import { useState, type FormEvent, type ChangeEvent, useEffect } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormField } from '@/components/admin/ScheduleFormFields';
import { ScheduleTable } from '@/components/admin/ScheduleTable';
import { PrintScheduleButton } from '@/components/admin/PrintScheduleButton';
import { Upload, PlusCircle, PlayCircle } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { TableCell } from '@/components/ui/table';

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

const ACTIVE_TANDING_SCHEDULE_KEY = 'SILATSCORE_ACTIVE_TANDING_SCHEDULE';

export default function ScheduleTandingPage() {
  const [schedules, setSchedules] = useState<ScheduleTanding[]>([]);
  const [formData, setFormData] = useState<Omit<ScheduleTanding, 'id'>>(initialFormState);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);

  useEffect(() => {
    const storedActiveSchedule = localStorage.getItem(ACTIVE_TANDING_SCHEDULE_KEY);
    if (storedActiveSchedule) {
      try {
        const activeSchedule: ScheduleTanding = JSON.parse(storedActiveSchedule);
        setActiveScheduleId(activeSchedule.id);
      } catch (error) {
        console.error("Error parsing active schedule from localStorage:", error);
        localStorage.removeItem(ACTIVE_TANDING_SCHEDULE_KEY);
      }
    }
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isEditing) {
      setSchedules(schedules.map(s => s.id === isEditing ? { ...formData, id: isEditing } : s));
      setIsEditing(null);
    } else {
      const newScheduleId = Date.now().toString();
      setSchedules([...schedules, { ...formData, id: newScheduleId }]);
    }
    setFormData(initialFormState);
  };

  const handleEdit = (id: string) => {
    const scheduleToEdit = schedules.find(s => s.id === id);
    if (scheduleToEdit) {
      setFormData(scheduleToEdit);
      setIsEditing(id);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) {
      setSchedules(schedules.filter(s => s.id !== id));
      if (id === activeScheduleId) {
        localStorage.removeItem(ACTIVE_TANDING_SCHEDULE_KEY);
        setActiveScheduleId(null);
      }
    }
  };
  
  const handleFileUpload = () => {
    alert('Fungsi unggah XLS belum diimplementasikan.');
  };

  const handleActivateSchedule = (schedule: ScheduleTanding) => {
    localStorage.setItem(ACTIVE_TANDING_SCHEDULE_KEY, JSON.stringify(schedule));
    setActiveScheduleId(schedule.id);
    alert(`Jadwal Pertandingan No. ${schedule.matchNumber} (${schedule.pesilatMerahName} vs ${schedule.pesilatBiruName}) telah diaktifkan.`);
  };

  const tandingTableHeaders = ["No. Match", "Tanggal", "Tempat", "Pesilat Merah", "Pesilat Biru", "Babak", "Kelas"];

  return (
    <>
      <PageTitle title="Jadwal Pertandingan Tanding" description="Kelola jadwal pertandingan kategori tanding.">
        <div className="flex gap-2">
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
                <TableCell>{new Date(s.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</TableCell>
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

    