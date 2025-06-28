
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

  const roundGap = "5rem";
  const boxHeight = 80;
  const boxWidth = 220;
  
  const getMatchVerticalGap = (roundMatchCount: number): number => {
    if (roundMatchCount <= 1) return 100;
    if (roundMatchCount === 2) return 240; // Semi-finals
    if (roundMatchCount === 4) return 120; // Quarter-finals
    return 100; // Default for 8+ matches
  };


  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex justify-start items-stretch overflow-x-auto p-6 md:p-10 min-h-[600px]" style={{ gap: roundGap }}>
          {scheme.rounds.map((round, roundIndex) => {
            const verticalGap = getMatchVerticalGap(round.matches.length);
            const isLastRound = roundIndex === scheme.rounds.length - 1;

            return (
              <div key={round.roundNumber} className="flex flex-col flex-shrink-0" style={{ width: `${boxWidth}px`}}>
                <h3 className="text-lg font-bold text-center text-primary uppercase tracking-wider mb-8 h-8">
                  {round.name}
                </h3>
                <div className="relative flex-grow">
                  {round.matches.map((match, matchIndex) => {
                    let topPosition: number;
                    if (isLastRound && roundIndex > 0) {
                      const prevRound = scheme.rounds[roundIndex - 1];
                      const prevRoundGap = getMatchVerticalGap(prevRound.matches.length);
                      const prevRoundHeight = prevRound.matches.length * prevRoundGap;
                      topPosition = (prevRoundHeight / 2) - (boxHeight / 2);
                    } else {
                      topPosition = matchIndex * verticalGap + (verticalGap - boxHeight) / 2;
                    }

                    return (
                      <Fragment key={match.matchInternalId}>
                        {/* Match Box */}
                        <div
                          className="absolute"
                          style={{ top: `${topPosition}px`, left: 0, width: '100%', height: `${boxHeight}px` }}
                        >
                          <div className="relative z-10 flex items-center h-full">
                            <span className="absolute -left-7 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-6 flex items-center justify-center text-xs font-sans font-bold border">
                              {match.globalMatchNumber}
                            </span>
                            <div className="bg-background rounded-lg p-2 shadow-sm border border-border w-full h-full text-sm flex flex-col justify-around">
                                <div className="truncate">
                                  <p className="font-semibold">{match.participant1?.name || '(Bye)'}</p>
                                  <p className="text-xs text-muted-foreground">{match.participant1?.contingent || ''}</p>
                                </div>
                                <div className="border-t border-border/80" />
                                <div className="truncate">
                                  <p className="font-semibold">{match.participant2?.name || (roundIndex === 0 ? '(Bye)' : 'Pemenang ...')}</p>
                                  <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p>
                                </div>
                            </div>
                          </div>
                        </div>

                        {/* Connector Lines */}
                        {!isLastRound && (
                          <>
                            {/* Horizontal line from this match box */}
                            <div className="bg-border absolute" style={{
                              top: `${topPosition + boxHeight / 2}px`,
                              left: '100%',
                              width: `calc(${roundGap} / 2)`,
                              height: '2px'
                            }}/>

                            {/* Vertical and horizontal lines connecting pairs */}
                            {matchIndex % 2 === 0 && (
                              <>
                                {/* Vertical line */}
                                <div className="bg-border absolute" style={{
                                  top: `${topPosition + boxHeight / 2}px`,
                                  left: `calc(100% + ${roundGap} / 2)`,
                                  width: '2px',
                                  height: `${verticalGap}px`
                                }}/>
                                {/* Horizontal line to next round match */}
                                <div className="bg-border absolute" style={{
                                  top: `${topPosition + boxHeight / 2 + verticalGap / 2}px`,
                                  left: `calc(100% + ${roundGap} / 2)`,
                                  width: `calc(${roundGap} / 2)`,
                                  height: '2px'
                                }}/>
                              </>
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
