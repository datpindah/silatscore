
"use client";

import type { Scheme, SchemeMatch } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// Smaller constants for a more compact view
const BOX_WIDTH = 200;
const BOX_HEIGHT = 60;
const ROUND_GAP = 50;
const VERTICAL_GAP = 20;

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
      if (roundIndex === numRounds - 1) {
        const finalRound = rounds[numRounds - 1];
        const yOffset = (totalHeight / 2) - (finalRound.matches.length * (BOX_HEIGHT + VERTICAL_GAP)) / 2;
        return matchIndex * (BOX_HEIGHT + VERTICAL_GAP) + yOffset;
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
    
    const preliminaryMatches = rounds[0].matches.length;
    const finalRoundMatches = rounds[numRounds-1].matches.length;
    const totalHeight = (preliminaryMatches > finalRoundMatches ? preliminaryMatches : finalRoundMatches) * (BOX_HEIGHT + VERTICAL_GAP) * 0.7;


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
              if (roundIndex === 0) return null; // No lines for the first round

              return round.matches.map((match) => {
                const childPos = positions.get(match.matchInternalId);
                if (!childPos) return null;

                const prevRound = rounds[roundIndex - 1];
                const parent1Index = round.matches.indexOf(match) * 2;
                const parent2Index = parent1Index + 1;
                
                const parent1Match = prevRound.matches[parent1Index];
                const parent2Match = prevRound.matches[parent2Index];

                const endX = childPos.x;
                const endY = childPos.y + BOX_HEIGHT / 2;

                const paths = [];

                if (parent1Match) {
                    const parent1Pos = positions.get(parent1Match.matchInternalId);
                    if (parent1Pos) {
                        const startX1 = parent1Pos.x + BOX_WIDTH;
                        const startY1 = parent1Pos.y + BOX_HEIGHT / 2;
                        const midX = startX1 + ROUND_GAP / 2;

                        paths.push(<path key={`h1-${match.matchInternalId}`} d={`M ${startX1} ${startY1} H ${midX}`} className="fill-none stroke-border/70" strokeWidth="2" />);
                        
                        if (parent2Match) {
                            const parent2Pos = positions.get(parent2Match.matchInternalId);
                            if (parent2Pos) {
                                const startY2 = parent2Pos.y + BOX_HEIGHT / 2;
                                paths.push(<path key={`v-${match.matchInternalId}`} d={`M ${midX} ${startY1} V ${startY2}`} className="fill-none stroke-border/70" strokeWidth="2" />);
                            }
                        } else {
                           // If no parent2, the line to child comes from parent1's Y
                           paths.push(<path key={`h2-${match.matchInternalId}`} d={`M ${midX} ${startY1} H ${endX}`} className="fill-none stroke-border/70" strokeWidth="2" />);
                        }
                    }
                }
                if (parent2Match) {
                   const parent2Pos = positions.get(parent2Match.matchInternalId);
                   if (parent2Pos) {
                       const startX2 = parent2Pos.x + BOX_WIDTH;
                       const startY2 = parent2Pos.y + BOX_HEIGHT / 2;
                       const midX = startX2 + ROUND_GAP / 2;
                       paths.push(<path key={`h3-${match.matchInternalId}`} d={`M ${startX2} ${startY2} H ${midX}`} className="fill-none stroke-border/70" strokeWidth="2" />);
                   }
                }

                if (parent1Match && parent2Match) {
                   const midX = childPos.x - ROUND_GAP / 2;
                   paths.push(<path key={`h4-${match.matchInternalId}`} d={`M ${midX} ${endY} H ${endX}`} className="fill-none stroke-border/70" strokeWidth="2" />);
                }
                
                return paths;
              });
            })}
          </svg>
          
          {rounds.map((round) => (
            round.matches.map((match) => {
              const pos = positions.get(match.matchInternalId);
              if (!pos) return null;

              return (
                <div
                  key={match.matchInternalId}
                  className="absolute group transition-shadow hover:shadow-lg"
                  style={{ top: `${pos.y}px`, left: `${pos.x}px`, width: `${BOX_WIDTH}px`, height: `${BOX_HEIGHT}px` }}
                >
                  <div className="relative z-10 flex items-center h-full">
                      <span className="absolute -left-6 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-5 flex items-center justify-center text-xs font-sans font-bold border">
                        {match.globalMatchNumber}
                      </span>
                      <div className="bg-background rounded-md p-2 border border-border w-full h-full text-sm flex flex-col justify-around">
                          <div className="truncate">
                            <p className="font-semibold">{match.participant1?.name || '(Bye)'}</p>
                            <p className="text-xs text-muted-foreground">{match.participant1?.contingent || ''}</p>
                          </div>
                          <div className="border-t border-border/80" />
                          <div className="truncate">
                            <p className="font-semibold">{match.participant2?.name || ''}</p>
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
