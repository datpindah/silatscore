
"use client";

import { useState } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

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
    const category = selectedTandingAge === ALL_FILTER_VALUE ? 'Semua Kategori Usia' : selectedTandingAge;
    const fileName = `Template_Jadwal_Tanding_${category.replace(/\s+/g, '_')}.xlsx`;

    const headers = [
      "Nomor Pertandingan",
      "Tanggal (YYYY-MM-DD)",
      "Tempat Pertandingan",
      "Nama Pesilat Merah",
      "Kontingen Pesilat Merah",
      "Nama Pesilat Biru",
      "Kontingen Pesilat Biru",
      "Babak",
      "Kelas Tanding"
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    // Set column widths (optional, for better readability)
    const colWidths = headers.map(header => ({ wch: header.length + 5 })); // Add some padding
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jadwal Tanding");
    XLSX.writeFile(wb, fileName);

    alert(`Mengunduh template XLSX jadwal Tanding untuk kategori: ${category}.`);
  };

  const handleDownloadTGRTemplate = () => {
    const ageCat = selectedTgrAge === ALL_FILTER_VALUE ? 'Semua_Kategori_Usia' : selectedTgrAge.replace(/\s+/g, '_');
    const tgrCat = selectedTgrCategory === ALL_FILTER_VALUE ? 'Semua_Kategori_TGR' : selectedTgrCategory.replace(/\s+/g, '_');
    const fileName = `Template_Jadwal_TGR_${ageCat}_${tgrCat}.xlsx`;

    const headers = [
      "Nomor Undian",
      "Pool/Grup", // This can also be used for Babak if preferred, or we add a specific "Babak" column.
      "Babak Pertandingan", // New column for Babak
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

    alert(`Mengunduh template XLSX jadwal TGR untuk kategori usia: ${selectedTgrAge === ALL_FILTER_VALUE ? 'Semua Usia' : selectedTgrAge}, kategori TGR: ${selectedTgrCategory === ALL_FILTER_VALUE ? 'Semua Kategori TGR' : selectedTgrCategory}.`);
  };

  return (
    <>
      <PageTitle title="Rekapitulasi & Template Data Jadwal" description="Unduh template untuk data jadwal pertandingan Tanding dan TGR." />

      <Card className="mb-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline text-primary">Template Jadwal Tanding</CardTitle>
          <CardDescription>Filter berdasarkan kategori usia dan unduh template jadwal Tanding untuk diisi.</CardDescription>
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
              Download Template Jadwal Tanding (.xlsx)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Template ini digunakan untuk mengimpor data jadwal pertandingan ke halaman Jadwal Tanding.
          </p>
          <div className="mt-6">
            <Table>
              <TableCaption>Contoh Struktur Template Jadwal Tanding</TableCaption>
              <TableHeader>
                <TableRow><TableHead>Nomor Pertandingan</TableHead><TableHead>Tanggal</TableHead><TableHead>Tempat</TableHead><TableHead>Pesilat Merah</TableHead><TableHead>Pesilat Biru</TableHead><TableHead>Babak</TableHead><TableHead>Kelas</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-4">
                    Template akan berisi header: Nomor Pertandingan, Tanggal, Tempat, Nama Pesilat Merah, Kontingen Merah, Nama Pesilat Biru, Kontingen Biru, Babak, Kelas Tanding.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline text-primary">Template Jadwal TGR</CardTitle>
          <CardDescription>Filter berdasarkan kategori usia dan TGR, lalu unduh template jadwal TGR.</CardDescription>
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
              Download Template Jadwal TGR (.xlsx)
            </Button>
          </div>
           <p className="text-xs text-muted-foreground">
            Template ini digunakan untuk mengimpor data jadwal pertandingan ke halaman Jadwal TGR.
          </p>
          <div className="mt-6">
            <Table>
              <TableCaption>Contoh Struktur Template Jadwal TGR</TableCaption>
              <TableHeader>
                <TableRow><TableHead>No. Undian</TableHead><TableHead>Pool/Grup</TableHead><TableHead>Babak</TableHead><TableHead>Kategori</TableHead><TableHead>Nama Peserta/Tim</TableHead><TableHead>Kontingen</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                    Template akan berisi header: Nomor Undian, Pool/Grup, Babak Pertandingan, Kategori, Nama Peserta, Kontingen.
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
