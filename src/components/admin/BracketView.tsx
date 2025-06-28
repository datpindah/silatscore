
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MatchItemProps {
  match: Scheme['rounds'][0]['matches'][0];
}

function MatchItem({ match }: MatchItemProps) {
  const p1 = match.participant1;
  const p2 = match.participant2;

  return (
    <div className="bg-card rounded-lg p-3 shadow-sm border border-border z-10 relative min-w-[250px] space-y-2">
       <span className="absolute -left-3.5 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-7 flex items-center justify-center text-xs font-sans font-bold border">
        {match.globalMatchNumber}
      </span>
      <div className="flex-1 pl-4">
        <p className={cn("font-semibold truncate", !p1 && "text-muted-foreground/70")}>
          {p1?.name || '(Pemenang ...)'}
        </p>
        {p1?.contingent && <p className="text-xs text-muted-foreground truncate">{p1.contingent}</p>}
      </div>
      <div className="pl-4">
        <div className="border-t border-border/50 w-full" />
      </div>
      <div className="flex-1 pl-4">
         <p className={cn("font-semibold truncate", !p2 && "text-muted-foreground/70")}>
          {p2?.name || '(Pemenang ...)'}
        </p>
        {p2?.contingent && <p className="text-xs text-muted-foreground truncate">{p2.contingent}</p>}
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
      <Card className="mt-8 bg-card text-card-foreground">
        <CardHeader>
          <CardTitle>Bagan Pertandingan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {scheme.type === 'TGR'
              ? `Daftar peserta untuk kategori ${scheme.tgrCategory || ''} (${scheme.ageCategory}) telah berhasil disimpan.`
              : 'Tidak ada pertandingan yang dihasilkan untuk skema ini.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-stretch gap-16 overflow-x-auto p-8 bg-background">
          {scheme.rounds.map((round, roundIndex) => (
            <div key={round.roundNumber} className="flex flex-col justify-around h-full flex-shrink-0">
              <h3 className="text-xl font-bold text-center text-primary uppercase mb-8 shrink-0 min-w-[250px]">
                {round.name}
              </h3>
              <div className="flex flex-col justify-around h-full gap-8">
                {round.matches.map((match, matchIndex) => (
                  <div key={match.matchInternalId} className="relative">
                    <MatchItem match={match} />
                    
                    {/* Connectors */}
                    {roundIndex < scheme.rounds.length - 1 && (
                      <>
                        {/* Horizontal line extending from this match */}
                        <div className="absolute top-1/2 left-full w-8 h-px bg-border -translate-y-px" />

                        {/* Vertical line connecting to the horizontal line of the next match's connector */}
                        {matchIndex % 2 === 0 && (
                           <div className="absolute top-1/2 left-[calc(100%_+_2rem)] h-[calc(50%_+_2rem)] w-px bg-border" />
                        )}
                         {matchIndex % 2 !== 0 && (
                          <div className="absolute bottom-1/2 left-[calc(100%_+_2rem)] h-[calc(50%_+_2rem)] w-px bg-border" />
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
