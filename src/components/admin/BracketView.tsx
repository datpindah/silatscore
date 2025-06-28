
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

  if (scheme.type !== 'Tanding' || !scheme.rounds || scheme.rounds.length === 0) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Bagan Pertandingan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {scheme.type === 'TGR' 
              ? `Daftar peserta untuk kategori ${scheme.tgrCategory} (${scheme.ageCategory}) telah berhasil disimpan.`
              : 'Tidak ada pertandingan yang dihasilkan untuk skema ini.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start gap-16 overflow-x-auto p-8">
          {scheme.rounds.map((round, roundIndex) => (
            <div key={round.roundNumber} className="flex flex-col items-center gap-6">
              <h3 className="text-xl font-bold text-center text-primary uppercase shrink-0 min-w-[250px]">{round.name}</h3>
              <div className="flex flex-col justify-around gap-20">
                {round.matches.reduce((acc, match, index) => {
                  if (index % 2 === 0) acc.push([]);
                  acc[acc.length - 1].push(match);
                  return acc;
                }, [] as SchemeMatch[][]).map((matchPair, pairIndex) => (
                  <div key={`pair-${pairIndex}`} className="flex flex-col justify-around gap-8 relative">
                    {matchPair.map((match, matchIndexInPair) => (
                      <div key={match.matchInternalId} className="relative">
                        <MatchItem match={match} />
                        {roundIndex < scheme.rounds.length - 1 && (
                          <div className="absolute top-1/2 left-full w-8 h-px bg-border" />
                        )}
                      </div>
                    ))}
                    {roundIndex < scheme.rounds.length - 1 && matchPair.length > 1 && (
                      <>
                        <div className="absolute top-1/2 left-[calc(100%_+_2rem)] h-full w-px bg-border" />
                        <div className="absolute top-1/2 left-[calc(100%_+_2rem)] w-8 h-px bg-border" />
                      </>
                    )}
                    {roundIndex < scheme.rounds.length - 1 && matchPair.length === 1 && (
                      <div className="absolute top-1/2 left-[calc(100%_+_2rem)] w-8 h-px bg-border" />
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
