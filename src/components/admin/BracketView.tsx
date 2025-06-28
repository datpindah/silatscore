
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface BracketViewProps {
  scheme: Scheme | null;
}

export function BracketView({ scheme }: BracketViewProps) {
  if (!scheme) {
    return null;
  }

  // This component is specifically for Tanding brackets.
  // For TGR, it shows a confirmation card.
  if (scheme.type !== 'Tanding') {
    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Daftar Peserta TGR Dibuat</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">
                    Daftar peserta untuk kategori {scheme.tgrCategory} ({scheme.ageCategory}) telah berhasil disimpan.
                    Anda sekarang dapat membuat jadwal pertandingan TGR secara manual.
                </p>
            </CardContent>
        </Card>
    );
  }
  
  if (!scheme.rounds || scheme.rounds.length === 0) {
      return (
         <Card className="mt-8">
            <CardHeader>
              <CardTitle>Bagan Pertandingan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Tidak ada pertandingan yang dihasilkan untuk skema ini.
              </p>
            </CardContent>
          </Card>
      );
  }


  return (
    <Card className="mt-8 bg-gray-800/95 text-white border-gray-700">
      <CardHeader>
        <CardTitle className="text-accent">Bagan Pertandingan: {scheme.tandingClass} ({scheme.ageCategory})</CardTitle>
        <CardDescription className="text-gray-400">Bagan ini dibuat secara otomatis. Pemenang dari setiap partai akan maju ke babak berikutnya.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6 overflow-x-auto p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
          {scheme.rounds.map((round) => (
            <div key={round.roundNumber} className="flex-shrink-0 w-64 space-y-6">
              <h3 className="text-xl font-bold text-center text-gray-300 uppercase tracking-wider">{round.name}</h3>
              <div className="space-y-4">
                {round.matches.map((match) => (
                  <div key={match.matchInternalId} className="bg-gray-700/80 rounded-lg p-3 shadow-md space-y-2 ring-1 ring-gray-600/50">
                    <p className="text-xs text-gray-400 font-mono">Partai #{match.globalMatchNumber}</p>
                    <div className="text-sm font-medium">
                      <p className="truncate">{match.participant1?.name || '(Belum Ditentukan)'}</p>
                      {match.participant1?.contingent && <p className="text-xs text-gray-400 truncate">{match.participant1.contingent}</p>}
                    </div>
                    <div className="border-t border-gray-500 w-full my-1" />
                    <div className="text-sm font-medium">
                       <p className="truncate">{match.participant2?.name || '(Belum Ditentukan)'}</p>
                        {match.participant2?.contingent && <p className="text-xs text-gray-400 truncate">{match.participant2.contingent}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
