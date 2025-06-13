
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
    
    const scheduleData: Omit<ScheduleTGR, 'id'> = {
      lotNumber: formData.lotNumber,
      category: formData.category,
      pesilatMerahName: formData.pesilatMerahName,
      pesilatMerahContingent: formData.pesilatMerahContingent,
      pesilatBiruName: formData.pesilatBiruName || '', // Ensure empty string if not provided
      pesilatBiruContingent: formData.pesilatBiruContingent || '', // Ensure empty string if not provided
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
        lotNumber: scheduleToEdit.lotNumber,
        category: scheduleToEdit.category,
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

  const tableHeaders = ["No. Partai/Undian", "Kategori", "Pesilat Merah", "Kontingen Merah", "Pesilat Biru", "Kontingen Biru"];
  
  const categoryIcons: Record<TGRCategoryType, React.ReactNode> = {
    Tunggal: <User className="h-4 w-4 inline mr-1" />,
    Ganda: <Users className="h-4 w-4 inline mr-1" />,
    Regu: <UserSquare className="h-4 w-4 inline mr-1" />,
    'Jurus Tunggal Bebas': <Swords className="h-4 w-4 inline mr-1" />,
  };
  
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
          />
        </CardContent>
      </Card>
    </>
  );
}

