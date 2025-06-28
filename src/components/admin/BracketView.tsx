
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface MatchItemProps {
  match: Scheme['rounds'][0]['matches'][0];
}

function MatchItem({ match }: MatchItemProps) {
  return (
    <div className="bg-gray-700/80 rounded-lg p-3 shadow-md space-y-2 ring-1 ring-gray-600/50 z-10 relative min-w-[250px]">
      <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
        <span className="bg-gray-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
          {match.globalMatchNumber}
        </span>
      </p>
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
  );
}


export function BracketView({ scheme }: BracketViewProps) {
  if (!scheme) {
    return null;
  }

  if (scheme.type !== 'Tanding') {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Daftar Peserta TGR Dibuat</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Daftar peserta untuk kategori {scheme.tgrCategory} ({scheme.ageCategory}) telah berhasil disimpan.
            Anda sekarang dapat membuat jadwal pertandingan TGR dari skema ini.
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
        <CardDescription className="text-gray-400">Bagan ini dibuat berdasarkan urutan peserta. Pemenang dari setiap partai akan maju ke babak berikutnya.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-16 md:gap-24 overflow-x-auto p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
          {scheme.rounds.map((round, roundIndex) => (
            <div key={round.roundNumber} className="flex flex-col gap-10">
              <h3 className="text-xl font-bold text-center text-gray-300 uppercase tracking-wider">{round.name}</h3>
              <div className="flex flex-col justify-around flex-grow space-y-10">
                {round.matches.map((match, matchIndex) => (
                  <div key={match.matchInternalId} className="relative">
                    <MatchItem match={match} />
                    
                    {/* Connector Lines */}
                    {roundIndex < scheme.rounds.length - 1 && (
                      <>
                        {/* Horizontal line from match to vertical connector */}
                        <div className="absolute top-1/2 left-full w-8 md:w-12 h-px bg-gray-500 z-0" />
                        
                        {/* Vertical connector for a pair of matches */}
                        {matchIndex % 2 === 0 && (
                          <div className="absolute top-1/2 left-[calc(100%_+_2rem)] md:left-[calc(100%_+_3rem)] w-px h-[calc(100%_+_2.5rem)] bg-gray-500 z-0" />
                        )}

                        {/* Horizontal line from vertical connector to next round */}
                        {matchIndex % 2 === 0 && (
                           <div className="absolute top-[calc(100%_+_1.25rem)] left-[calc(100%_+_2rem)] md:left-[calc(100%_+_3rem)] w-8 md:w-12 h-px bg-gray-500 z-0" />
                        )}
                      </>
                    )}
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

