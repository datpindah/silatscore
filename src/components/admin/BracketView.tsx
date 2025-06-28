
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fragment } from 'react';

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

  const roundGap = "5rem"; // Space between rounds

  return (
    <Card className="mt-8 bg-background/95 text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex justify-start items-stretch overflow-x-auto p-6 md:p-10 min-h-[500px]" style={{ gap: roundGap }}>
          {scheme.rounds.map((round, roundIndex) => {
            const isFirstRound = roundIndex === 0;
            const isLastRound = roundIndex === scheme.rounds.length - 1;

            return (
              <div key={round.roundNumber} className="flex flex-col flex-shrink-0" style={{ width: '220px' }}>
                <h3 className="text-lg font-bold text-center text-primary uppercase tracking-wider mb-8 h-8">
                  {round.name}
                </h3>
                <div className="flex flex-col justify-around flex-grow relative">
                  {round.matches.map((match, matchIndex) => {
                    // Calculate the vertical gap between matches
                    const matchGap = 100 / round.matches.length;
                    const topPosition = `calc(${matchGap * (matchIndex + 0.5)}% - 40px)`; // 40px is half the match box height

                    return (
                      <Fragment key={match.matchInternalId}>
                        {/* Match Box */}
                        <div
                          className="absolute"
                          style={{ top: topPosition, left: 0, width: '100%' }}
                        >
                          <div className="relative z-10 flex items-center">
                            <span className="absolute -left-7 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-6 flex items-center justify-center text-xs font-sans font-bold border">
                              {match.globalMatchNumber}
                            </span>
                            <div className="bg-card rounded-lg p-2 shadow-sm border border-border w-full h-[80px] text-sm flex flex-col justify-around">
                                <div className="truncate">
                                  <p className="font-semibold">{match.participant1?.name || '(Bye)'}</p>
                                  <p className="text-xs text-muted-foreground">{match.participant1?.contingent || ''}</p>
                                </div>
                                <div className="border-t border-border" />
                                <div className="truncate">
                                  <p className="font-semibold">{match.participant2?.name || (isFirstRound ? '(Bye)' : 'Pemenang ...')}</p>
                                  <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p>
                                </div>
                            </div>
                          </div>
                        </div>

                        {/* Connector Lines */}
                        {!isLastRound && (
                          <>
                            {/* Horizontal line from match box */}
                            <div
                              className="bg-border absolute"
                              style={{
                                left: '100%',
                                top: `calc(${topPosition} + 40px)`,
                                width: `calc(${roundGap} / 2)`,
                                height: '2px',
                              }}
                            />
                             {/* Vertical connector line (only for top match of a pair) */}
                            {matchIndex % 2 === 0 && (
                                <div className="bg-border absolute"
                                style={{
                                    left: `calc(100% + ${roundGap} / 2)`,
                                    top: `calc(${topPosition} + 40px)`, // from top match center
                                    width: '2px',
                                    height: `calc(${matchGap}% + 2px)`, // height to center of next match
                                }}
                                />
                            )}
                             {/* Horizontal line to next round's match (only for top match of a pair) */}
                             {matchIndex % 2 === 0 && (
                                <div className="bg-border absolute"
                                style={{
                                    left: `calc(100% + ${roundGap} / 2)`,
                                    top: `calc(${topPosition} + ${matchGap / 2}%)`,
                                    width: `calc(${roundGap} / 2)`,
                                    height: '2px',
                                }}
                                />
                             )}
                          </>
                        )}
                      </Fragment>
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
