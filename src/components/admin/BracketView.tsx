
"use client";

import type { Scheme, SchemeMatch } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MatchItemProps {
  match: Scheme['rounds'][0]['matches'][0];
}

function MatchItem({ match }: MatchItemProps) {
  return (
    <div className="bg-background rounded-lg p-3 shadow-md space-y-2 ring-1 ring-border/50 z-10 relative min-w-[250px]">
      <p className="text-xs text-muted-foreground font-mono flex items-center gap-2">
        <span className="bg-muted text-muted-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">
          {match.globalMatchNumber}
        </span>
      </p>
      <div className="text-sm font-medium">
        <p className="truncate text-foreground">{match.participant1?.name || '(Belum Ditentukan)'}</p>
        {match.participant1?.contingent && <p className="text-xs text-muted-foreground truncate">{match.participant1.contingent}</p>}
      </div>
      <div className="border-t border-border w-full my-1" />
      <div className="text-sm font-medium">
        <p className="truncate text-foreground">{match.participant2?.name || '(Belum Ditentukan)'}</p>
        {match.participant2?.contingent && <p className="text-xs text-muted-foreground truncate">{match.participant2.contingent}</p>}
      </div>
    </div>
  );
}


export function BracketView({ scheme }: { scheme: Scheme | null }) {
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
    <Card className="mt-8 bg-card text-card-foreground border-border">
      <CardHeader>
        <CardTitle className="text-primary">Bagan Pertandingan: {scheme.tandingClass} ({scheme.ageCategory})</CardTitle>
        <CardDescription className="text-muted-foreground">Bagan ini dibuat berdasarkan urutan peserta. Pemenang dari setiap partai akan maju ke babak berikutnya.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-stretch gap-16 md:gap-24 overflow-x-auto p-4">
          {scheme.rounds.map((round, roundIndex) => {
            const isSemifinal = round.matches.length === 2 && scheme.rounds[roundIndex + 1]?.matches.length === 1;
            const pairGapClass = isSemifinal ? "gap-48" : "gap-10"; // 12rem vs 2.5rem
            const pairGapValue = isSemifinal ? "12rem" : "2.5rem";
            const halfPairGapValue = isSemifinal ? "6rem" : "1.25rem";

            return (
              <div key={round.roundNumber} className="flex flex-col justify-center flex-grow gap-10">
                <h3 className="text-xl font-bold text-center text-foreground uppercase tracking-wider shrink-0">{round.name}</h3>
                <div className="flex flex-col gap-20">
                  {
                    round.matches.reduce((acc, match, index) => {
                      if (index % 2 === 0) {
                        acc.push([match]);
                      } else {
                        acc[acc.length - 1].push(match);
                      }
                      return acc;
                    }, [] as SchemeMatch[][]).map((matchPair, pairIndex) => (
                      <div key={`pair-${roundIndex}-${pairIndex}`} className={cn("flex flex-col", pairGapClass)}>
                        {matchPair.map((match, matchIndexInPair) => (
                          <div key={match.matchInternalId} className="relative">
                            <MatchItem match={match} />
                            {roundIndex < scheme.rounds.length - 1 && (
                              <>
                                <div className="absolute top-1/2 left-full w-8 md:w-12 h-px bg-border z-0" />
                                
                                {matchIndexInPair === 0 && matchPair.length > 1 && (
                                  <>
                                    <div
                                      className="absolute top-1/2 left-[calc(100%_+_2rem)] md:left-[calc(100%_+_3rem)] w-px bg-border z-0"
                                      style={{ height: `calc(100% + ${pairGapValue})` }}
                                    />
                                    <div
                                      className="absolute left-[calc(100%_+_2rem)] md:left-[calc(100%_+_3rem)] w-8 md:w-12 h-px bg-border z-0"
                                      style={{ top: `calc(100% + ${halfPairGapValue})` }}
                                    />
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ))
                  }
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  );
}
