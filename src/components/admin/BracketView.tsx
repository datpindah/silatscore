
"use client";

import type { Scheme, SchemeMatch } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fragment, useMemo } from 'react';

const BOX_WIDTH = 220;
const BOX_HEIGHT = 80;
const ROUND_GAP = 90;
const VERTICAL_GAP = 40;

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
    
    // Recursive function to calculate Y positions from the final backwards
    function calculateY(match: SchemeMatch, roundIndex: number): number {
      const memoizedPos = posMap.get(match.matchInternalId);
      if (memoizedPos) return memoizedPos.y;

      if (roundIndex === numRounds - 1) { // Final match
        return 0; // Center of our coordinate system
      }

      const parentIndexInOwnRound = rounds[roundIndex].matches.findIndex(m => m.matchInternalId === match.matchInternalId);
      const childIndexInNextRound = Math.floor(parentIndexInOwnRound / 2);
      const childMatch = rounds[roundIndex + 1].matches[childIndexInNextRound];
      
      const childY = calculateY(childMatch, roundIndex + 1);
      
      const ySpread = (BOX_HEIGHT + VERTICAL_GAP) * Math.pow(2, numRounds - 2 - roundIndex);

      const newY = childY + (parentIndexInOwnRound % 2 === 0 ? -ySpread / 2 : ySpread / 2);
      
      posMap.set(match.matchInternalId, { x: roundDepths[roundIndex], y: newY });
      return newY;
    }

    // Trigger the recursion from the last match
    calculateY(rounds[numRounds - 1].matches[0], numRounds - 1);

    // Populate positions for any matches that were not touched by recursion (if any)
    rounds.forEach((round, roundIndex) => {
        round.matches.forEach(match => {
            if (!posMap.has(match.matchInternalId)) {
                calculateY(match, roundIndex);
            }
        });
    });

    // Normalize all Y positions to be positive
    const allYPositions = Array.from(posMap.values()).map(p => p.y);
    const minY = Math.min(...allYPositions);
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
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-auto">
       <CardHeader>
          <CardTitle>{scheme.tandingClass || scheme.tgrCategory || "Detail Bagan"}</CardTitle>
          <p className="text-md text-muted-foreground">{`${scheme.type || ''} - ${scheme.ageCategory || ''} | Gel: ${scheme.gelanggangs?.join(', ') || 'N/A'} | Babak: ${scheme.round}`}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative p-10" style={{ height: `${totalHeight + 40}px`, width: `${totalWidth + 40}px` }}>
          {/* Render Connectors */}
          {rounds.map((round, roundIndex) => {
             if (roundIndex === 0) return null; // No connectors before the first round
             
             return round.matches.map((match, matchIndex) => {
                const childPos = positions.get(match.matchInternalId);
                if (!childPos) return null;

                const parent1 = rounds[roundIndex - 1].matches[matchIndex * 2];
                const parent2 = rounds[roundIndex - 1].matches[matchIndex * 2 + 1];

                const parent1Pos = parent1 ? positions.get(parent1.matchInternalId) : null;
                const parent2Pos = parent2 ? positions.get(parent2.matchInternalId) : null;
                
                // This match is the result of a bye, draw a straight line
                if (parent1 && parent1.participant2 === null && parent1Pos) {
                   const sourceX = parent1Pos.x + BOX_WIDTH;
                   const sourceY = parent1Pos.y + BOX_HEIGHT / 2;
                   const destX = childPos.x;
                   return <div key={`conn-${match.matchInternalId}`} className="bg-border absolute" style={{ top: `${sourceY-1}px`, left: `${sourceX}px`, height: '2px', width: `${destX - sourceX}px` }}/>;
                }
                 if (parent2 && parent2.participant2 === null && parent2Pos) {
                   const sourceX = parent2Pos.x + BOX_WIDTH;
                   const sourceY = parent2Pos.y + BOX_HEIGHT / 2;
                   const destX = childPos.x;
                   return <div key={`conn-${match.matchInternalId}`} className="bg-border absolute" style={{ top: `${sourceY-1}px`, left: `${sourceX}px`, height: '2px', width: `${destX - sourceX}px` }}/>;
                }

                if (!parent1Pos || !parent2Pos) return null;

                const lineY1 = parent1Pos.y + BOX_HEIGHT / 2;
                const lineY2 = parent2Pos.y + BOX_HEIGHT / 2;
                const lineX = parent1Pos.x + BOX_WIDTH;
                const midPointX = lineX + ROUND_GAP / 2;
                const midPointY = childPos.y + BOX_HEIGHT / 2;

                return(
                  <Fragment key={`conn-${match.matchInternalId}`}>
                    {/* H-line from parent 1 */}
                    <div className="bg-border absolute" style={{ top: `${lineY1 - 1}px`, left: `${lineX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }}/>
                    {/* H-line from parent 2 */}
                    <div className="bg-border absolute" style={{ top: `${lineY2 - 1}px`, left: `${lineX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }}/>
                    {/* V-line connecting parents */}
                    <div className="bg-border absolute" style={{ top: `${Math.min(lineY1, lineY2)}px`, left: `${midPointX - 1}px`, width: '2px', height: `${Math.abs(lineY1-lineY2)}px` }}/>
                    {/* H-line to child */}
                    <div className="bg-border absolute" style={{ top: `${midPointY - 1}px`, left: `${midPointX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }}/>
                  </Fragment>
                )
             })
          })}

          {/* Render Boxes */}
          {rounds.map((round) => (
            round.matches.map((match) => {
              const pos = positions.get(match.matchInternalId);
              if (!pos) return null;

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
                            <p className="font-semibold">{match.participant2?.name || (match.participant1 ? '(Bye)' : 'Pemenang ...')}</p>
                            <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p>
                          </div>
                      </div>
                    </div>
                </div>
              );
            })
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
