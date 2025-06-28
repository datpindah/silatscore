
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

function getWinnerPlaceholder(match: Scheme['rounds'][0]['matches'][0]): string {
  if (match.participant1 && !match.participant2) return match.participant1.name;
  if (!match.participant1 && match.participant2) return match.participant2.name;
  return `Pemenang Partai ${match.globalMatchNumber}`;
}

export function BracketView({ scheme }: { scheme: Scheme | null }) {
  if (!scheme) return null;

  if (scheme.type === 'TGR' || !scheme.rounds || scheme.rounds.length === 0) {
    return (
      <Card className="mt-8 bg-card text-card-foreground">
        <CardHeader>
          <CardTitle>Daftar Peserta</CardTitle>
        </CardHeader>
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
    <Card className="mt-8 bg-background/95 text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex justify-start items-stretch gap-12 lg:gap-20 overflow-x-auto p-6 md:p-10 min-h-[500px]">
          {scheme.rounds.map((round, roundIndex) => {
            const isLastRound = roundIndex === scheme.rounds.length - 1;
            const isSemiFinal = !isLastRound && scheme.rounds[roundIndex + 1].matches.length === 1;
            const semiFinalGap = isSemiFinal ? '10rem' : '1.5rem';

            return (
              <div key={round.roundNumber} className="flex flex-col flex-shrink-0">
                <h3 className="text-lg font-bold text-center text-primary uppercase tracking-wider mb-8 h-8">
                  {round.name}
                </h3>
                <div className="flex flex-col justify-around flex-grow" style={{ gap: semiFinalGap }}>
                  {round.matches.map((match, matchIndex) => {
                    const isTopMatchOfPair = matchIndex % 2 === 0;

                    return (
                      <div key={match.matchInternalId} className="relative z-0">
                        <div className="relative z-10 flex items-center">
                          <span className="absolute -left-7 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-6 flex items-center justify-center text-xs font-sans font-bold border">
                            {match.globalMatchNumber}
                          </span>
                          <div className="bg-card rounded-lg p-2 shadow-sm border border-border w-[220px] text-sm">
                            <div className="flex flex-col justify-center h-full">
                              <div className="truncate py-1">
                                <p className="font-semibold">{match.participant1?.name || '(Bye)'}</p>
                                <p className="text-xs text-muted-foreground">{match.participant1?.contingent || ''}</p>
                              </div>
                              <div className="border-t border-border my-1" />
                              <div className="truncate py-1">
                                <p className="font-semibold">{match.participant2?.name || (match.participant1 ? getWinnerPlaceholder(match) : '(Bye)')}</p>
                                <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {!isLastRound && isTopMatchOfPair && (
                          <div
                            className="absolute top-1/2 left-full w-10 h-0"
                            style={{ height: `calc(100% + ${semiFinalGap})` }}
                          >
                            <div className="absolute top-0 left-0 w-full h-full">
                              <div className="absolute top-0 left-0 w-1/2 h-px bg-border" />
                              <div className="absolute top-0 left-1/2 w-px h-full bg-border" />
                              <div className="absolute bottom-0 left-0 w-1/2 h-px bg-border" />
                              <div className="absolute top-1/2 left-1/2 w-1/2 h-px bg-border -translate-y-1/2" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
