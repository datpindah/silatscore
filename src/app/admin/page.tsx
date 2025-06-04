"use client";

import { useState } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataRecapTable } from '@/components/admin/DataRecapTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Filter } from 'lucide-react';
import { ageCategories, type AgeCategory } from '@/lib/types';

export default function AdminDashboardPage() {
  const [selectedAgeCategory, setSelectedAgeCategory] = useState<AgeCategory | ''>('');

  const handleDownloadData = () => {
    // Placeholder for data download logic
    alert(`Mendownload data untuk kategori: ${selectedAgeCategory || 'Semua Kategori'}`);
  };

  return (
    <>
      <PageTitle title="Admin Dashboard" description="Manajemen data dan jadwal pertandingan Pencak Silat.">
          <Button onClick={handleDownloadData} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Download className="mr-2 h-4 w-4" />
            Download Data
          </Button>
      </PageTitle>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline">
            <Filter className="h-5 w-5 text-primary" />
            Filter Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Select onValueChange={(value) => setSelectedAgeCategory(value as AgeCategory)} value={selectedAgeCategory}>
              <SelectTrigger id="age-category">
                <SelectValue placeholder="Pilih Kategori Usia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Semua Kategori</SelectItem>
                {ageCategories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-2">
              Pilih kategori usia untuk memfilter data yang ditampilkan dan diunduh.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Rekapitulasi Pertandingan</CardTitle>
        </CardHeader>
        <CardContent>
          <DataRecapTable />
        </CardContent>
      </Card>
    </>
  );
}
