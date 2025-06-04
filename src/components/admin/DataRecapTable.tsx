"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Match } from "@/lib/types"; // Assuming Match type is defined

// Placeholder data - replace with actual data fetching
const mockMatches: Partial<Match>[] = [
  { id: 'match1', matchNumber: 1, class: 'Kelas A Putra', pesilatMerah: { pesilatInfo: { name: 'Atlet Merah 1', contingent: 'Kontingen X' } } as any, pesilatBiru: { pesilatInfo: { name: 'Atlet Biru 1', contingent: 'Kontingen Y' } } as any, status: 'Finished', date: new Date() },
  { id: 'match2', matchNumber: 2, class: 'Kelas B Putri', pesilatMerah: { pesilatInfo: { name: 'Atlet Merah 2', contingent: 'Kontingen Z' } } as any, pesilatBiru: { pesilatInfo: { name: 'Atlet Biru 2', contingent: 'Kontingen W' } } as any, status: 'Ongoing', date: new Date() },
  { id: 'match3', matchNumber: 3, class: 'Kelas C Putra', pesilatMerah: { pesilatInfo: { name: 'Atlet Merah 3', contingent: 'Kontingen P' } } as any, pesilatBiru: { pesilatInfo: { name: 'Atlet Biru 3', contingent: 'Kontingen Q' } } as any, status: 'Pending', date: new Date() },
];

export function DataRecapTable() {
  // In a real app, you'd fetch data, e.g., using React Query
  const matches = mockMatches;

  return (
    <Table>
      <TableCaption>Rekapitulasi Pertandingan</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>No. Match</TableHead>
          <TableHead>Kelas</TableHead>
          <TableHead>Pesilat Merah</TableHead>
          <TableHead>Pesilat Biru</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Tanggal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((match) => (
          <TableRow key={match.id}>
            <TableCell>{match.matchNumber}</TableCell>
            <TableCell>{match.class}</TableCell>
            <TableCell>{match.pesilatMerah?.pesilatInfo.name} ({match.pesilatMerah?.pesilatInfo.contingent})</TableCell>
            <TableCell>{match.pesilatBiru?.pesilatInfo.name} ({match.pesilatBiru?.pesilatInfo.contingent})</TableCell>
            <TableCell>
              <Badge variant={
                match.status === 'Finished' ? 'default' :
                match.status === 'Ongoing' ? 'secondary' : // You might want a specific variant for 'Ongoing'
                'outline' 
              } className={
                match.status === 'Finished' ? 'bg-green-500 text-white' :
                match.status === 'Ongoing' ? 'bg-yellow-500 text-black' :
                ''
              }>
                {match.status}
              </Badge>
            </TableCell>
            <TableCell>{match.date?.toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
