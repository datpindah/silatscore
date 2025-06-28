
"use client";

import type { Scheme, SchemeMatch, SchemeRound } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fragment } from 'react';

// A helper function to find the destination match for a preliminary round winner
const findPrelimDestination = (sourceMatch: SchemeMatch, nextRound: SchemeRound | undefined) => {
  if (!nextRound) return null;
  const placeholder = `Pemenang Partai ${sourceMatch.globalMatchNumber}`;
  for (let i = 0; i < nextRound.matches.length; i++) {
    const targetMatch = nextRound.matches[i];
    if (targetMatch.participant1?.name === placeholder) {
      return { match: targetMatch, matchIndex: i, slot: 'top' as const };
    }
    if (targetMatch.participant2?.name === placeholder) {
      return { match: targetMatch, matchIndex: i, slot: 'bottom' as const };
    }
  }
  return null;
};


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
  
  const getMatchVerticalGap = (roundMatchCount: number, isSemifinal: boolean): number => {
    if (isSemifinal) return 240; // Specific gap for semifinals
    if (roundMatchCount <= 1) return 100;
    if (roundMatchCount === 2) return 240; // Also semifinals
    if (roundMatchCount === 4) return 120;
    return 100;
  };
  
  const prelimRoundIndex = scheme.rounds.findIndex(r => r.name === 'Babak Penyisihan');

  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex justify-start items-stretch overflow-x-auto p-6 md:p-10 min-h-[600px]" style={{ gap: roundGap }}>
          {scheme.rounds.map((round, roundIndex) => {
            const isLastRound = roundIndex === scheme.rounds.length - 1;
            // A round is semi-final if it has 2 matches and is not the last round (which would be the final)
            const isSemifinal = round.matches.length === 2 && !isLastRound;
            const verticalGap = getMatchVerticalGap(round.matches.length, isSemifinal);
            const isPrelim = roundIndex === prelimRoundIndex;

            return (
              <div key={round.roundNumber} className="flex flex-col flex-shrink-0" style={{ width: `${boxWidth}px`}}>
                <h3 className="text-lg font-bold text-center text-primary uppercase tracking-wider mb-8 h-8">
                  {round.name}
                </h3>
                <div className="relative flex-grow">
                  {round.matches.map((match, matchIndex) => {
                    let topPosition: number;
                    // Center the final match based on the semi-final layout
                    if (isLastRound && roundIndex > 0) {
                      const prevRound = scheme.rounds[roundIndex - 1];
                      const prevRoundIsSemifinal = prevRound.matches.length === 2 && roundIndex -1 !== scheme.rounds.length -1;
                      const prevRoundGap = getMatchVerticalGap(prevRound.matches.length, prevRoundIsSemifinal);
                      // Total height occupied by previous round's matches and gaps
                      const totalHeightOfPrevRound = (prevRound.matches.length -1) * prevRoundGap + boxHeight;
                      topPosition = totalHeightOfPrevRound / 2 - boxHeight / 2;
                    } else {
                      topPosition = matchIndex * verticalGap + (verticalGap - boxHeight) / 2;
                    }

                    return (
                      <Fragment key={match.matchInternalId}>
                        {/* Match Box */}
                        <div className="absolute" style={{ top: `${topPosition}px`, left: 0, width: '100%', height: `${boxHeight}px` }}>
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
                            {isPrelim ? (
                              (() => {
                                const dest = findPrelimDestination(match, scheme.rounds[roundIndex + 1]);
                                if (!dest) return null;
                                
                                const nextRoundIsSemifinal = scheme.rounds[roundIndex + 1]?.matches.length === 2 && roundIndex + 1 !== scheme.rounds.length - 1;
                                const nextVerticalGap = getMatchVerticalGap(scheme.rounds[roundIndex + 1]?.matches.length || 0, nextRoundIsSemifinal);
                                const destTopPosition = dest.matchIndex * nextVerticalGap + (nextVerticalGap - boxHeight) / 2;
                                
                                const sourceY = topPosition + boxHeight / 2;
                                // Connect to top or bottom quarter of the destination box
                                const destY = destTopPosition + (dest.slot === 'top' ? boxHeight * 0.25 : boxHeight * 0.75);

                                return (
                                  <Fragment>
                                    {/* H-line from source */}
                                    <div className="bg-border absolute" style={{ top: `${sourceY - 1}px`, left: '100%', width: `calc(${roundGap} / 2)`, height: '2px' }} />
                                    {/* V-line */}
                                    <div className="bg-border absolute" style={{ top: `${Math.min(sourceY, destY) - 1}px`, left: `calc(100% + ${roundGap} / 2 - 1px)`, width: '2px', height: `${Math.abs(sourceY - destY)}px` }} />
                                    {/* H-line to destination */}
                                    <div className="bg-border absolute" style={{ top: `${destY - 1}px`, left: `calc(100% + ${roundGap} / 2)`, width: `calc(${roundGap} / 2)`, height: '2px' }} />
                                  </Fragment>
                                );
                              })()
                            ) : (
                              matchIndex % 2 === 0 && (
                                <Fragment>
                                  {/* H-line from top box */}
                                  <div className="bg-border absolute" style={{ top: `${topPosition + boxHeight / 2 -1}px`, left: '100%', width: `calc(${roundGap} / 2)`, height: '2px' }}/>
                                  {/* H-line from bottom box */}
                                  <div className="bg-border absolute" style={{ top: `${topPosition + verticalGap + boxHeight / 2 -1}px`, left: '100%', width: `calc(${roundGap} / 2)`, height: '2px' }} />
                                  {/* V-line connecting the two */}
                                  <div className="bg-border absolute" style={{ top: `${topPosition + boxHeight / 2}px`, left: `calc(100% + ${roundGap} / 2 - 1px)`, width: '2px', height: `${verticalGap}px` }} />
                                  {/* H-line to next round */}
                                  <div className="bg-border absolute" style={{ top: `${topPosition + verticalGap / 2 + boxHeight / 2 - 1}px`, left: `calc(100% + ${roundGap} / 2)`, width: `calc(${roundGap} / 2)`, height: '2px' }}/>
                                </Fragment>
                              )
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
