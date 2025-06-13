
"use client";

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { FormField } from '@/components/admin/ScheduleFormFields';
import { ScheduleTable } from '@/components/admin/ScheduleTable';
import { PrintScheduleButton } from '@/components/admin/PrintScheduleButton';
import { Upload, PlusCircle, User, Users, UserSquare, Swords } from 'lucide-react';
import type { ScheduleTGR, TGRCategoryType } from '@/lib/types';
import { tgrCategoriesList } from '@/lib/types';
import { TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const initialFormState: Omit<ScheduleTGR, 'id'> = {
  lotNumber: 1,
  category: 'Tunggal',
  group: '',
  participantNamesStr: '',
  contingent: '',
  pesilatMerahName: '',
  pesilatMerahContingent: '',
  pesilatBiruName: '',
  pesilatBiruContingent: '',
};

export default function ScheduleTGRPage() {
  const [schedules, setSchedules] = useState<ScheduleTGR[]>([]);
  const [formData, setFormData] = useState<Omit<ScheduleTGR, 'id'>>(initialFormState);
  const [isEditing, setIsEditing] = useState<string | null>(null);

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

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    let scheduleData: Omit<ScheduleTGR, 'id'> = {
      lotNumber: formData.lotNumber,
      category: formData.category,
    };

    if (formData.category === 'Jurus Tunggal Bebas') {
      scheduleData = {
        ...scheduleData,
        pesilatMerahName: formData.pesilatMerahName,
        pesilatMerahContingent: formData.pesilatMerahContingent,
        pesilatBiruName: formData.pesilatBiruName,
        pesilatBiruContingent: formData.pesilatBiruContingent,
        group: undefined, // Clear non-relevant fields
        participantNamesStr: undefined,
        participantNames: undefined,
        contingent: undefined,
      };
    } else {
      const participantNames = formData.participantNamesStr?.split(',').map(name => name.trim()).filter(name => name) || [];
      scheduleData = {
        ...scheduleData,
        group: formData.group,
        participantNamesStr: formData.participantNamesStr,
        participantNames,
        contingent: formData.contingent,
        pesilatMerahName: undefined, // Clear non-relevant fields
        pesilatMerahContingent: undefined,
        pesilatBiruName: undefined,
        pesilatBiruContingent: undefined,
      };
    }


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
        lotNumber: scheduleToEdit.lotNumber,
        category: scheduleToEdit.category,
        group: scheduleToEdit.group || '',
        participantNamesStr: scheduleToEdit.participantNames?.join(', ') || '',
        contingent: scheduleToEdit.contingent || '',
        pesilatMerahName: scheduleToEdit.pesilatMerahName || '',
        pesilatMerahContingent: scheduleToEdit.pesilatMerahContingent || '',
        pesilatBiruName: scheduleToEdit.pesilatBiruName || '',
        pesilatBiruContingent: scheduleToEdit.pesilatBiruContingent || '',
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

  const tableHeaders = ["No. Partai/Undian", "Kategori", "Peserta/Tim Merah", "Kontingen Merah", "Peserta/Tim Biru", "Kontingen Biru", "Pool/Grup"];
  
  const categoryIcons: Record<TGRCategoryType, React.ReactNode> = {
    Tunggal: <User className="h-4 w-4 inline mr-1" />,
    Ganda: <Users className="h-4 w-4 inline mr-1" />,
    Regu: <UserSquare className="h-4 w-4 inline mr-1" />,
    'Jurus Tunggal Bebas': <Swords className="h-4 w-4 inline mr-1" />,
  };
  
  const isJurusTunggalBebas = formData.category === 'Jurus Tunggal Bebas';

  return (
    <>
      <PageTitle title="Jadwal Pertandingan TGR" description="Kelola jadwal pertandingan kategori Tunggal, Ganda, Regu, dan Jurus Tunggal Bebas.">
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

            {isJurusTunggalBebas ? (
              <>
                <FormField id="pesilatMerahName" label="Nama Pesilat Merah" value={formData.pesilatMerahName || ''} onChange={handleChange} required />
                <FormField id="pesilatMerahContingent" label="Kontingen Pesilat Merah" value={formData.pesilatMerahContingent || ''} onChange={handleChange} required />
                <FormField id="pesilatBiruName" label="Nama Pesilat Biru" value={formData.pesilatBiruName || ''} onChange={handleChange} required />
                <FormField id="pesilatBiruContingent" label="Kontingen Pesilat Biru" value={formData.pesilatBiruContingent || ''} onChange={handleChange} required />
              </>
            ) : (
              <>
                <FormField id="group" label="Pool/Grup" value={formData.group || ''} onChange={handleChange} placeholder="cth: A, B" required />
                <FormField 
                  id="participantNamesStr" 
                  label="Nama Peserta/Tim (pisahkan dengan koma)" 
                  value={formData.participantNamesStr || ''} 
                  onChange={handleChange} 
                  placeholder="cth: Atlet 1, Atlet 2 (untuk Ganda/Regu)"
                  required 
                  className="md:col-span-2"
                />
                <FormField id="contingent" label="Kontingen" value={formData.contingent || ''} onChange={handleChange} required className="md:col-span-2"/>
              </>
            )}
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
                {s.category === 'Jurus Tunggal Bebas' ? (
                  <>
                    <TableCell>{s.pesilatMerahName || 'N/A'}</TableCell>
                    <TableCell>{s.pesilatMerahContingent || 'N/A'}</TableCell>
                    <TableCell>{s.pesilatBiruName || 'N/A'}</TableCell>
                    <TableCell>{s.pesilatBiruContingent || 'N/A'}</TableCell>
                    <TableCell>N/A</TableCell> 
                  </>
                ) : (
                  <>
                    <TableCell>{s.participantNames?.join(', ') || 'N/A'}</TableCell>
                    <TableCell>{s.contingent || 'N/A'}</TableCell>
                    <TableCell>N/A</TableCell>
                    <TableCell>N/A</TableCell>
                    <TableCell>{s.group || 'N/A'}</TableCell>
                  </>
                )}
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
