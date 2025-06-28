
"use client";

import type { Scheme, SchemeMatch } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo } from 'react';

const BOX_WIDTH = 220;
const BOX_HEIGHT = 70;
const ROUND_GAP = 80;
const VERTICAL_GAP = 30;

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

  const { rounds } = scheme;
  const numRounds = rounds.length;

  const positions = useMemo(() => {
    const posMap = new Map<string, { x: number; y: number }>();
    if (numRounds === 0) return posMap;

    const roundDepths = rounds.map((_, i) => i * (BOX_WIDTH + ROUND_GAP));

    const calculateY = (roundIndex: number, matchIndex: number): number => {
      // Base case: Final round is always at y=0 to start.
      if (roundIndex === numRounds - 1) {
          return 0;
      }
      
      const nextRound = rounds[roundIndex + 1];
      const childMatchIndex = Math.floor(matchIndex / 2);
      const childMatch = nextRound.matches[childMatchIndex];
      const childKey = childMatch.matchInternalId;

      if (!posMap.has(childKey)) {
           const childX = roundDepths[roundIndex + 1];
           const childY = calculateY(roundIndex + 1, childMatchIndex);
           posMap.set(childKey, { x: childX, y: childY });
      }

      const childPos = posMap.get(childKey)!;
      const ySpread = (BOX_HEIGHT + VERTICAL_GAP) * Math.pow(2, numRounds - 2 - roundIndex);

      return childPos.y + (matchIndex % 2 === 0 ? -ySpread / 2 : ySpread / 2);
    };

    rounds.forEach((round, roundIndex) => {
        round.matches.forEach((match, matchIndex) => {
            const key = match.matchInternalId;
            if (!posMap.has(key)) {
                const x = roundDepths[roundIndex];
                const y = calculateY(roundIndex, matchIndex);
                posMap.set(key, { x, y });
            }
        });
    });

    const allYPositions = Array.from(posMap.values()).map(p => p.y);
    const minY = Math.min(...allYPositions, 0);
    if (minY < 0) {
      for (const [key, pos] of posMap.entries()) {
        posMap.set(key, { ...pos, y: pos.y - minY });
      }
    }
    
    return posMap;
  }, [rounds, numRounds]);


  const totalHeight = useMemo(() => {
    if (positions.size === 0) return BOX_HEIGHT;
    const allY = Array.from(positions.values()).map(p => p.y);
    return Math.max(...allY) + BOX_HEIGHT;
  }, [positions]);
  
  const totalWidth = useMemo(() => {
    if (numRounds === 0) return BOX_WIDTH;
    return (numRounds * (BOX_WIDTH + ROUND_GAP)) - ROUND_GAP;
  }, [numRounds]);


  return (
    <div className="bg-card text-card-foreground border-border overflow-auto p-4 md:p-10">
      <div className="relative" style={{ height: `${totalHeight + 40}px`, width: `${totalWidth + 40}px` }}>
          <svg className="absolute inset-0 h-full w-full">
            {rounds.map((round, roundIndex) => {
              if (roundIndex === numRounds - 1) return null; // No lines from final round
              
              return round.matches.map((match) => {
                  const matchPos = positions.get(match.matchInternalId);
                  if (!matchPos) return null;

                  // Skip drawing line if the match is a bye
                  if(match.participant1 && match.participant2 === null) return null;

                  const nextRound = rounds[roundIndex + 1];
                  const childMatchIndex = Math.floor(round.matches.indexOf(match) / 2);
                  const childMatch = nextRound.matches[childMatchIndex];
                  if (!childMatch) return null;

                  const childPos = positions.get(childMatch.matchInternalId);
                  if (!childPos) return null;

                  const startX = matchPos.x + BOX_WIDTH;
                  const startY = matchPos.y + BOX_HEIGHT / 2;
                  
                  const endX = childPos.x;
                  const endY = childPos.y + BOX_HEIGHT / 2;

                  const midX = startX + ROUND_GAP / 2;

                  return (
                      <path
                          key={`conn-${match.matchInternalId}`}
                          d={`M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`}
                          className="fill-none stroke-border"
                          strokeWidth="2"
                      />
                  );
              });
            })}
          </svg>

          {rounds.map((round) => (
            round.matches.map((match) => {
              const pos = positions.get(match.matchInternalId);
              if (!pos) return null;

              if (!match.participant1 && !match.participant2) return null;

              return (
                <div
                  key={match.matchInternalId}
                  className="absolute"
                  style={{ top: `${pos.y}px`, left: `${pos.x}px`, width: `${BOX_WIDTH}px`, height: `${BOX_HEIGHT}px` }}
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
                            <p className="font-semibold">{match.participant2?.name || (match.participant1 ? '' : '(Kosong)')}</p>
                            <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p>
                          </div>
                      </div>
                    </div>
                </div>
              );
            })
          ))}
        </div>
    </div>
  );
}
