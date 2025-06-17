
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ScheduleTanding, ScheduleTGR, AgeCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RecapMatchItem {
  id: string;
  type: 'Tanding' | 'TGR';
  identifier: string; // Match Number or Lot Number
  categoryDisplay: string; // Kelas Tanding or Kategori TGR
  ageCategoryDerived?: AgeCategory | string; // For filtering, derived from class/category
  participantsDisplay: string; // Pesilat Merah vs Biru or Nama Peserta TGR
  status: 'Selesai' | 'Berlangsung' | 'Berlangsung (Verifikasi)' | 'Berlangsung (Jeda)' | `Selesai (${'biru' | 'merah'})` | 'Akan Datang' | 'Menunggu Data';
  date: string; // Formatted date
  gelanggang: string;
  originalData: ScheduleTanding | ScheduleTGR; // Keep original for potential detailed view
  matchSpecificData?: any; // Store timer_status or matchResult
}

interface DataRecapTableProps {
  matches: RecapMatchItem[];
}

export function DataRecapTable({ matches }: DataRecapTableProps) {

  const getStatusBadgeVariant = (status: RecapMatchItem['status']) => {
    if (status === 'Selesai' || status.startsWith('Selesai (')) return 'default';
    if (status.startsWith('Berlangsung')) return 'secondary';
    if (status === 'Akan Datang') return 'outline';
    return 'destructive'; // For 'Menunggu Data'
  };

  const getStatusBadgeClass = (status: RecapMatchItem['status']) => {
     if (status === 'Selesai' || status.startsWith('Selesai (')) return 'bg-green-500 text-white';
     if (status.startsWith('Berlangsung')) return 'bg-yellow-500 text-black';
     if (status === 'Akan Datang') return 'border-blue-500 text-blue-600'; // More distinct than default outline
     return 'bg-gray-400 text-white'; // Menunggu Data
  };


  return (
    <Table>
      <TableCaption>Rekapitulasi Pertandingan Terdaftar</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px]">Jenis</TableHead>
          <TableHead className="w-[100px]">No.</TableHead>
          <TableHead>Kategori/Kelas</TableHead>
          <TableHead>Peserta</TableHead>
          <TableHead className="w-[150px]">Status</TableHead>
          <TableHead className="w-[150px]">Tanggal</TableHead>
          <TableHead className="w-[150px]">Gelanggang</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center h-24">
              Tidak ada data pertandingan yang cocok dengan filter.
            </TableCell>
          </TableRow>
        ) : (
          matches.map((match) => (
            <TableRow key={match.id}>
              <TableCell>
                <Badge variant={match.type === 'Tanding' ? "default" : "secondary"} 
                       className={cn(match.type === 'Tanding' ? "bg-primary/80" : "bg-accent/80 text-accent-foreground")}>
                  {match.type}
                </Badge>
              </TableCell>
              <TableCell>{match.identifier}</TableCell>
              <TableCell>{match.categoryDisplay}</TableCell>
              <TableCell>{match.participantsDisplay}</TableCell>
              <TableCell>
                <Badge 
                    variant={getStatusBadgeVariant(match.status)} 
                    className={getStatusBadgeClass(match.status)}
                >
                  {match.status}
                </Badge>
              </TableCell>
              <TableCell>{match.date}</TableCell>
              <TableCell>{match.gelanggang}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
