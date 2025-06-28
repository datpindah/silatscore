
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

interface MatchItemProps {
  match: Scheme['rounds'][0]['matches'][0];
  isTopInPair: boolean;
  isBottomInPair: boolean;
  hasNextRound: boolean;
}

function MatchCard({ match }: { match: Scheme['rounds'][0]['matches'][0] }) {
  const p1 = match.participant1;
  const p2 = match.participant2;

  return (
    <div className="bg-card rounded-md p-2 shadow-sm border border-border min-w-[200px] space-y-1.5 flex flex-col">
      <div className="flex-1">
        <p className={cn("text-sm font-medium truncate", !p1 && "text-muted-foreground/70")}>
          {p1?.name || '(Pemenang ...)'}
        </p>
        {p1?.contingent && <p className="text-xs text-muted-foreground truncate">{p1.contingent}</p>}
      </div>
      <div className="border-t border-border/60" />
      <div className="flex-1">
         <p className={cn("text-sm font-medium truncate", !p2 && "text-muted-foreground/70")}>
          {p2?.name || '(Pemenang ...)'}
        </p>
        {p2?.contingent && <p className="text-xs text-muted-foreground truncate">{p2.contingent}</p>}
      </div>
    </div>
  );
}


export function BracketView({ scheme }: { scheme: Scheme | null }) {
  if (!scheme) return null;

  if (scheme.type === 'TGR' || !scheme.rounds || scheme.rounds.length === 0) {
    return (
      <Card className="mt-8 bg-card text-card-foreground">
        <CardHeader><CardTitle>Daftar Peserta</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {scheme.type === 'TGR'
              ? `Daftar peserta untuk kategori ${scheme.tgrCategory || ''} (${scheme.ageCategory}) telah berhasil dibuat.`
              : 'Tidak ada pertandingan yang dihasilkan untuk skema ini.'}
          </p>
           <ul className="list-disc pl-5 mt-4">
              {scheme.participants.map(p => (
                  <li key={p.id}>{p.name} ({p.contingent})</li>
              ))}
           </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-stretch gap-10 lg:gap-16 overflow-x-auto p-6 md:p-10 bg-background/95">
          {scheme.rounds.map((round, roundIndex) => (
            <div 
              key={round.roundNumber} 
              className="flex flex-col justify-around h-full flex-shrink-0"
              style={{ paddingTop: `${(Math.pow(2, roundIndex) - 1) * 35}px`, paddingBottom: `${(Math.pow(2, roundIndex) - 1) * 35}px` }}
            >
              <h3 className="text-lg font-bold text-center text-primary uppercase tracking-wider mb-8 shrink-0 min-w-[200px]">
                {round.name}
              </h3>
              <div className="flex flex-col justify-around flex-grow gap-4">
                {round.matches.map((match, matchIndex) => (
                  <div key={match.matchInternalId} className="relative flex items-center">
                    {/* Match number circle */}
                    <span className="absolute -left-5 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-6 flex items-center justify-center text-xs font-sans font-bold border z-10">
                      {match.globalMatchNumber}
                    </span>
                    
                    <MatchCard match={match} />
                    
                    {/* Connectors */}
                    {roundIndex < scheme.rounds.length - 1 && (
                      <Fragment>
                        {/* Horizontal line from match */}
                        <div className="absolute top-1/2 left-full w-5 lg:w-8 h-px bg-border -translate-y-px" />
                        
                        {/* Vertical Connector Line */}
                        {matchIndex % 2 === 0 && (
                          <div
                            className="absolute top-1/2 left-[calc(100%_+_1.25rem)] lg:left-[calc(100%_+_2rem)] h-full w-px bg-border"
                            style={{ height: `calc(100% + 1rem)`}} // 1rem is the gap-4
                          />
                        )}
                        
                        {/* Horizontal line to next round's center */}
                        {matchIndex % 2 === 0 && (
                          <div className="absolute top-full left-[calc(100%_+_1.25rem)] lg:left-[calc(100%_+_2rem)] w-5 lg:w-8 h-px bg-border mt-[0.5rem]" />
                        )}
                      </Fragment>
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
