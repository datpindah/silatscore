
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { Scheme } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Eye, Filter, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ageCategories } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function SchemeListPage() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [filteredSchemes, setFilteredSchemes] = useState<Scheme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [filterType, setFilterType] = useState('all');
  const [filterAge, setFilterAge] = useState('all');
  const [filterClass, setFilterClass] = useState('');

  const fetchSchemes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const q = query(collection(db, 'schemes'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const schemesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Scheme));
      setSchemes(schemesData);
    } catch (err) {
      console.error("Error fetching schemes:", err);
      setError("Gagal memuat daftar bagan. Coba muat ulang halaman.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchemes();
  }, [fetchSchemes]);

  useEffect(() => {
    let tempSchemes = [...schemes];
    if (filterType !== 'all') {
      tempSchemes = tempSchemes.filter(s => s.type === filterType);
    }
    if (filterAge !== 'all') {
      tempSchemes = tempSchemes.filter(s => s.ageCategory === filterAge);
    }
    if (filterClass.trim() !== '') {
      tempSchemes = tempSchemes.filter(s => s.tandingClass?.toLowerCase().includes(filterClass.toLowerCase()));
    }
    setFilteredSchemes(tempSchemes);
  }, [filterType, filterAge, filterClass, schemes]);

  const handleDeleteScheme = async (schemeId: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus bagan ini secara permanen? Tindakan ini tidak dapat diurungkan.`)) {
        return;
    }

    setIsDeletingId(schemeId);
    setError(null);
    try {
      await deleteDoc(doc(db, 'schemes', schemeId));
      await fetchSchemes(); // Re-fetch the list from server to guarantee UI consistency
      alert('Bagan berhasil dihapus.');
    } catch (err) {
      console.error("Error deleting scheme:", err);
      const errorMessage = err instanceof Error ? err.message : "Terjadi kesalahan yang tidak diketahui.";
      setError(`Gagal menghapus bagan: ${errorMessage}`);
      alert(`Gagal menghapus bagan.`);
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleDeleteAllSchemes = async () => {
    if (!confirm(`Apakah Anda yakin ingin menghapus SEMUA bagan pertandingan secara permanen? Tindakan ini tidak dapat diurungkan.`)) {
      return;
    }

    setIsDeletingAll(true);
    setError(null);
    try {
      const q = query(collection(db, 'schemes'));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert('Tidak ada bagan untuk dihapus.');
        setIsDeletingAll(false);
        return;
      }

      const batch = writeBatch(db);
      querySnapshot.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();
      await fetchSchemes(); // Re-fetch to show the empty list
      alert(`${querySnapshot.size} bagan berhasil dihapus.`);

    } catch (err) {
      console.error("Error deleting all schemes:", err);
      const errorMessage = err instanceof Error ? err.message : "Terjadi kesalahan yang tidak diketahui.";
      setError(`Gagal menghapus semua bagan: ${errorMessage}`);
      alert(`Gagal menghapus semua bagan.`);
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <>
      <PageTitle title="Daftar Bagan Pertandingan" description="Lihat semua skema dan bagan pertandingan yang telah dibuat.">
        <Button 
          variant="destructive" 
          onClick={handleDeleteAllSchemes} 
          disabled={isLoading || isDeletingId !== null || isDeletingAll || schemes.length === 0}
        >
          {isDeletingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          Hapus Semua Bagan
        </Button>
      </PageTitle>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5 text-primary" /> Filter Bagan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4">
          <Select onValueChange={setFilterType} value={filterType}>
            <SelectTrigger><SelectValue placeholder="Pilih Tipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              <SelectItem value="Tanding">Tanding</SelectItem>
              <SelectItem value="TGR">TGR</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={setFilterAge} value={filterAge}>
            <SelectTrigger><SelectValue placeholder="Pilih Kategori Usia" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Usia</SelectItem>
              {ageCategories.map(age => <SelectItem key={age} value={age}>{age}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input 
            placeholder="Cari Kelas Tanding..."
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            disabled={filterType === 'TGR'}
          />
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-0">
          {isLoading && schemes.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Kategori/Kelas</TableHead>
                  <TableHead>Usia</TableHead>
                  <TableHead>Peserta</TableHead>
                  <TableHead>Tanggal Dibuat</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSchemes.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24">Tidak ada bagan ditemukan.</TableCell></TableRow>
                ) : (
                  filteredSchemes.map(scheme => (
                    <TableRow key={scheme.id}>
                      <TableCell><Badge variant={scheme.type === 'Tanding' ? 'default' : 'secondary'}>{scheme.type}</Badge></TableCell>
                      <TableCell>{scheme.tandingClass || scheme.tgrCategory}</TableCell>
                      <TableCell>{scheme.ageCategory}</TableCell>
                      <TableCell>{scheme.participantCount}</TableCell>
                      <TableCell>{scheme.createdAt?.toDate ? scheme.createdAt.toDate().toLocaleDateString('id-ID') : 'Invalid Date'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/scheme-list/${scheme.id}`}>
                              <Eye className="mr-2 h-4 w-4" /> Lihat
                            </Link>
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => handleDeleteScheme(scheme.id)}
                            disabled={isDeletingId === scheme.id}
                          >
                            {isDeletingId === scheme.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Hapus
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
