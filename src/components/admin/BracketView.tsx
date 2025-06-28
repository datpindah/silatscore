
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

// Helper to create a more robust placeholder for winners
function getWinnerPlaceholder(scheme: Scheme, match: Scheme['rounds'][0]['matches'][0], participantSlot: 1 | 2): string {
    // This is a complex problem. For now, a simpler placeholder is better.
    if (participantSlot === 1 && match.participant1) return match.participant1.name;
    if (participantSlot === 2 && match.participant2) return match.participant2.name;

    // Find which matches feed into this one
    const currentRoundIndex = scheme.rounds.findIndex(r => r.matches.some(m => m.matchInternalId === match.matchInternalId));
    if (currentRoundIndex < 1) return '(Peserta)';

    const prevRound = scheme.rounds[currentRoundIndex - 1];
    // Find the index of the current match in its round
    const matchIndexInCurrentRound = scheme.rounds[currentRoundIndex].matches.findIndex(m => m.matchInternalId === match.matchInternalId);
    
    // The source matches in the previous round are at 2*index and 2*index + 1
    const sourceMatchIndex1 = matchIndexInCurrentRound * 2;
    const sourceMatchIndex2 = sourceMatchIndex1 + 1;
    
    const sourceMatch1 = prevRound.matches[sourceMatchIndex1];
    const sourceMatch2 = prevRound.matches[sourceMatchIndex2];
    
    if (participantSlot === 1 && sourceMatch1) return `Pemenang Partai ${sourceMatch1.globalMatchNumber}`;
    if (participantSlot === 2 && sourceMatch2) return `Pemenang Partai ${sourceMatch2.globalMatchNumber}`;
    
    return '(Pemenang)';
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
        <div className="flex justify-start items-center gap-12 lg:gap-20 overflow-x-auto p-6 md:p-10 min-h-[500px]">
          {scheme.rounds.map((round, roundIndex) => {
            const isSemiFinal = round.matches.length === 2 && scheme.rounds[roundIndex + 1]?.matches.length === 1;
            const semiFinalGap = isSemiFinal ? '10rem' : '1.5rem';

            return (
              <div key={round.roundNumber} className="flex flex-col h-full flex-shrink-0">
                <h3 className="text-lg font-bold text-center text-primary uppercase tracking-wider mb-8 h-8">
                  {round.name}
                </h3>
                <div className="flex flex-col justify-center flex-grow" style={{ gap: semiFinalGap }}>
                    {round.matches.map((match, matchIndex) => (
                      <div key={match.matchInternalId} className="relative">
                        <div className="flex items-center">
                          {/* Match Number */}
                          <span className="absolute -left-7 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-6 flex items-center justify-center text-xs font-sans font-bold border z-10">
                            {match.globalMatchNumber}
                          </span>
                          {/* Match Card */}
                          <div className="bg-card rounded-lg p-2 shadow-sm border border-border w-[220px] text-sm">
                            <div className="flex flex-col justify-center h-full">
                              <div className="truncate py-1">
                                <p className="font-semibold">{match.participant1?.name ?? getWinnerPlaceholder(scheme, match, 1)}</p>
                                <p className="text-xs text-muted-foreground">{match.participant1?.contingent || ''}</p>
                              </div>
                              <div className="border-t border-border my-1" />
                              <div className="truncate py-1">
                                <p className="font-semibold">{match.participant2?.name ?? getWinnerPlaceholder(scheme, match, 2)}</p>
                                <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Connector for a pair of matches (drawn for the top match of the pair) */}
                        {roundIndex < scheme.rounds.length - 1 && matchIndex % 2 === 0 && (
                          <div
                            className="absolute"
                            style={{
                              top: '50%',
                              left: '100%',
                              width: '2.5rem', // Corresponds to lg:w-10
                              height: `calc(100% + ${semiFinalGap})`,
                            }}
                          >
                            {/* Part 1: The vertical line connecting the pair */}
                            <div className="absolute w-px h-full bg-border" style={{ left: '1.25rem' }} />
                            
                            {/* Part 2: The horizontal line from the top card to the vertical line */}
                            <div
                              className="absolute w-[1.25rem] h-px bg-border"
                              style={{ top: 0, left: 0 }}
                            />
                            
                            {/* Part 3: The horizontal line from the bottom card to the vertical line */}
                            <div
                              className="absolute w-[1.25rem] h-px bg-border"
                              style={{ bottom: 0, left: 0 }}
                            />
                            
                            {/* Part 4: The horizontal line from the vertical line to the next round's match */}
                            <div
                              className="absolute h-px bg-border"
                              style={{
                                top: '50%',
                                left: '1.25rem',
                                width: '1.25rem',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

