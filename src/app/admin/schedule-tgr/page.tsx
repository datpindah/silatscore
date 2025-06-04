"use client";

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormField } from '@/components/admin/ScheduleFormFields';
import { ScheduleTable } from '@/components/admin/ScheduleTable';
import { PrintScheduleButton } from '@/components/admin/PrintScheduleButton';
import { Upload, PlusCircle, User, Users, UserSquare } from 'lucide-react';
import type { ScheduleTGR } from '@/lib/types';
import { TableCell } from '@/components/ui/table';

const initialFormState: Omit<ScheduleTGR, 'id' | 'participantNames'> & { participantNamesStr: string } = {
  group: '',
  lotNumber: 1,
  category: 'Tunggal',
  participantNamesStr: '', // Comma-separated names
  contingent: '',
};

export default function ScheduleTGRPage() {
  const [schedules, setSchedules] = useState<ScheduleTGR[]>([]);
  const [formData, setFormData] = useState(initialFormState);
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }));
  };
  
  const handleSelectChange = (name: string) => (value: string) => {
     setFormData(prev => ({ ...prev, [name]: value as ScheduleTGR['category'] }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const participantNames = formData.participantNamesStr.split(',').map(name => name.trim()).filter(name => name);
    const scheduleData: Omit<ScheduleTGR, 'id'> = {
      group: formData.group,
      lotNumber: formData.lotNumber,
      category: formData.category,
      participantNames,
      contingent: formData.contingent,
    };

    if (isEditing) {
      setSchedules(schedules.map(s => s.id === isEditing ? { ...scheduleData, id: isEditing } : s));
      setIsEditing(null);
    } else {
      setSchedules([...schedules, { ...scheduleData, id: Date.now().toString() }]);
    }
    setFormData(initialFormState);
  };

  const handleEdit = (id: string) => {
    const scheduleToEdit = schedules.find(s => s.id === id);
    if (scheduleToEdit) {
      setFormData({
        ...scheduleToEdit,
        participantNamesStr: scheduleToEdit.participantNames.join(', '),
      });
      setIsEditing(id);
    }
  };

  const handleDelete = (id: string) => {
     if (confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) {
      setSchedules(schedules.filter(s => s.id !== id));
    }
  };

  const handleFileUpload = () => {
    alert('Fungsi unggah XLS belum diimplementasikan.');
  };

  const tgrTableHeaders = ["No. Undian", "Pool/Grup", "Kategori", "Nama Peserta", "Kontingen"];
  
  const categoryIcons = {
    Tunggal: <User className="h-4 w-4 inline mr-1" />,
    Ganda: <Users className="h-4 w-4 inline mr-1" />,
    Regu: <UserSquare className="h-4 w-4 inline mr-1" />,
  };

  return (
    <>
      <PageTitle title="Jadwal Pertandingan TGR" description="Kelola jadwal pertandingan kategori Tunggal, Ganda, dan Regu.">
        <div className="flex gap-2">
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
            <FormField id="lotNumber" label="Nomor Undian" type="number" value={formData.lotNumber} onChange={handleChange} required />
            <FormField id="group" label="Pool/Grup" value={formData.group} onChange={handleChange} placeholder="cth: A, B" required />
            <FormField 
              id="category" 
              label="Kategori" 
              as="select" 
              value={formData.category} 
              onSelectChange={handleSelectChange('category')}
              options={[
                { value: 'Tunggal', label: 'Tunggal' },
                { value: 'Ganda', label: 'Ganda' },
                { value: 'Regu', label: 'Regu' },
              ]}
              required 
            />
            <FormField 
              id="participantNamesStr" 
              label="Nama Peserta (pisahkan dengan koma)" 
              value={formData.participantNamesStr} 
              onChange={handleChange} 
              placeholder="cth: Atlet 1, Atlet 2"
              required 
              className="md:col-span-2"
            />
            <FormField id="contingent" label="Kontingen" value={formData.contingent} onChange={handleChange} required className="md:col-span-2"/>
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
            headers={tgrTableHeaders}
            renderRow={(s) => (
              <>
                <TableCell>{s.lotNumber}</TableCell>
                <TableCell>{s.group}</TableCell>
                <TableCell className="flex items-center">{categoryIcons[s.category]} {s.category}</TableCell>
                <TableCell>{s.participantNames.join(', ')}</TableCell>
                <TableCell>{s.contingent}</TableCell>
              </>
            )}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>
    </>
  );
}
