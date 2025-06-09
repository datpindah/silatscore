
"use client";

import { useState } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Download, Filter } from 'lucide-react';

const ageCategoriesRecap = ['Usia Dini', 'Pra-Remaja', 'Remaja', 'Dewasa'] as const;
type AgeCategoryRecap = typeof ageCategoriesRecap[number];

const tgrCategories = ['Tunggal', 'Ganda', 'Regu'] as const;
type TGRCategoryRecap = typeof tgrCategories[number];

const ALL_FILTER_VALUE = "ALL";

export default function DataRecapPage() {
  const [selectedTandingAge, setSelectedTandingAge] = useState<string>(ALL_FILTER_VALUE);
  const [selectedTgrAge, setSelectedTgrAge] = useState<string>(ALL_FILTER_VALUE);
  const [selectedTgrCategory, setSelectedTgrCategory] = useState<string>(ALL_FILTER_VALUE);

  const handleDownloadTandingTemplate = () => {
    const category = selectedTandingAge === ALL_FILTER_VALUE ? 'Semua Usia' : selectedTandingAge;
    alert(`Mengunduh template XLSX data peserta Tanding untuk kategori: ${category}.`);
    // Implement actual XLSX download logic here
  };

  const handleDownloadTGRTemplate = () => {
    const ageCat = selectedTgrAge === ALL_FILTER_VALUE ? 'Semua Usia' : selectedTgrAge;
    const tgrCat = selectedTgrCategory === ALL_FILTER_VALUE ? 'Semua Kategori TGR' : selectedTgrCategory;
    alert(`Mengunduh template XLSX data peserta TGR untuk kategori usia: ${ageCat}, kategori TGR: ${tgrCat}.`);
    // Implement actual XLSX download logic here
  };

  return (
    <>
      <PageTitle title="Rekapitulasi & Template Data Peserta" description="Kelola dan unduh template untuk data peserta pertandingan Tanding dan TGR." />

      {/* Card untuk Rekap Data Tanding */}
      <Card className="mb-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline text-primary">Data Peserta Tanding</CardTitle>
          <CardDescription>Filter berdasarkan kategori usia dan unduh template untuk diisi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-grow sm:max-w-xs">
              <label htmlFor="tanding-age-category" className="block text-sm font-medium text-foreground mb-1">Kategori Usia Tanding</label>
              <Select onValueChange={setSelectedTandingAge} value={selectedTandingAge}>
                <SelectTrigger id="tanding-age-category">
                  <SelectValue placeholder="Pilih Kategori Usia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>Semua Kategori Usia</SelectItem>
                  {ageCategoriesRecap.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleDownloadTandingTemplate} className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground">
              <Download className="mr-2 h-4 w-4" />
              Download Template Tanding (.xlsx)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Template ini digunakan untuk mengimpor data peserta ke halaman Jadwal Tanding.
          </p>
          <div className="mt-6">
            <Table>
              <TableCaption>Contoh Struktur Data Peserta Tanding (Template)</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Nama Peserta</TableHead>
                  <TableHead>Kontingen</TableHead>
                  <TableHead>Kelas Tanding</TableHead>
                  <TableHead>Kategori Usia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    Data peserta akan ditampilkan di sini setelah diunggah, atau ini adalah format template.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Card untuk Rekap Data TGR */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline text-primary">Data Peserta TGR</CardTitle>
          <CardDescription>Filter berdasarkan kategori usia dan TGR, lalu unduh template.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end flex-wrap">
            <div className="flex-grow sm:max-w-xs">
              <label htmlFor="tgr-age-category" className="block text-sm font-medium text-foreground mb-1">Kategori Usia TGR</label>
              <Select onValueChange={setSelectedTgrAge} value={selectedTgrAge}>
                <SelectTrigger id="tgr-age-category">
                  <SelectValue placeholder="Pilih Kategori Usia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>Semua Kategori Usia</SelectItem>
                  {ageCategoriesRecap.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-grow sm:max-w-xs">
              <label htmlFor="tgr-category-filter" className="block text-sm font-medium text-foreground mb-1">Kategori TGR</label>
              <Select onValueChange={setSelectedTgrCategory} value={selectedTgrCategory}>
                <SelectTrigger id="tgr-category-filter">
                  <SelectValue placeholder="Pilih Kategori TGR" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>Semua Kategori TGR</SelectItem>
                  {tgrCategories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleDownloadTGRTemplate} className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground">
              <Download className="mr-2 h-4 w-4" />
              Download Template TGR (.xlsx)
            </Button>
          </div>
           <p className="text-xs text-muted-foreground">
            Template ini digunakan untuk mengimpor data peserta ke halaman Jadwal TGR.
          </p>
          <div className="mt-6">
            <Table>
              <TableCaption>Contoh Struktur Data Peserta TGR (Template)</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Nama Peserta/Tim</TableHead>
                  <TableHead>Kontingen</TableHead>
                  <TableHead>Kategori TGR</TableHead>
                  <TableHead>Kategori Usia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    Data peserta akan ditampilkan di sini setelah diunggah, atau ini adalah format template.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
