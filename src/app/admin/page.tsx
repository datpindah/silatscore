
"use client";

import { useState, useEffect } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataRecapTable } from '@/components/admin/DataRecapTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Filter, AlertTriangle } from 'lucide-react';
import { ageCategories, type AgeCategory } from '@/lib/types';

const ALL_CATEGORIES_VALUE = "ALL_CATEGORIES";

export default function AdminDashboardPage() {
  const [selectedAgeCategory, setSelectedAgeCategory] = useState<string>(ALL_CATEGORIES_VALUE);
  // Placeholder: In a real app, this would be set based on actual data fetching results.
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  // useEffect(() => {
  //   // Example: Simulate data fetching and error
  //   // const fetchData = async () => {
  //   //   try {
  //   //     // ... your data fetching logic ...
  //   //     // if (error) throw new Error("Failed to load data due to permissions.");
  //   //     setDataLoadError(null);
  //   //   } catch (e) {
  //   //     if (e instanceof Error) setDataLoadError(e.message);
  //   //     else setDataLoadError("An unknown error occurred while fetching data.");
  //   //   }
  //   // };
  //   // fetchData();
  // }, []);

  const handleDownloadData = () => {
    const categoryToDownload = selectedAgeCategory === ALL_CATEGORIES_VALUE ? 'Semua Kategori' : selectedAgeCategory;
    // Simulate error if data couldn't be "loaded" for download
    if (dataLoadError) {
      alert(`Tidak dapat mengunduh data: ${dataLoadError}. Pastikan Anda sudah login dan memiliki izin yang cukup.`);
      return;
    }
    alert(`Mendownload data untuk kategori: ${categoryToDownload}`);
  };

  return (
    <>
      <PageTitle title="Admin Dashboard" description="Manajemen data dan jadwal pertandingan Pencak Silat.">
          <Button onClick={handleDownloadData} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Download className="mr-2 h-4 w-4" />
            Download Data
          </Button>
      </PageTitle>

      {dataLoadError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Gagal Memuat Data</AlertTitle>
          <AlertDescription>
            {dataLoadError} <br />
            Pastikan Anda telah login dengan akun yang memiliki akses. Jika masalah berlanjut, periksa aturan keamanan Firestore Anda.
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline">
            <Filter className="h-5 w-5 text-primary" />
            Filter Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Select onValueChange={(value) => setSelectedAgeCategory(value)} value={selectedAgeCategory}>
              <SelectTrigger id="age-category">
                <SelectValue placeholder="Pilih Kategori Usia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES_VALUE}>Semua Kategori</SelectItem>
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
          {/* If DataRecapTable fetched its own data, you'd pass dataLoadError or fetched data to it */}
          <DataRecapTable />
        </CardContent>
      </Card>
    </>
  );
}
