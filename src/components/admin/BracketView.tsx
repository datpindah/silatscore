
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo } from 'react';

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

    // Position the final round match first to anchor the layout
    const finalRound = rounds[numRounds - 1];
    const finalMatch = finalRound.matches[0];
    if (finalMatch) {
      posMap.set(finalMatch.matchInternalId, { x: roundDepths[numRounds - 1], y: 0 });
    }

    // Recursively calculate positions backwards from the final
    const calculateY = (roundIndex: number) => {
      if (roundIndex < 0) return;

      rounds[roundIndex].matches.forEach((match, matchIndex) => {
        // Find the match in the next round that this match's winner feeds into
        const nextRoundIndex = roundIndex + 1;
        if (nextRoundIndex < numRounds) {
          const nextRoundMatchIndex = Math.floor(matchIndex / 2);
          const childMatch = rounds[nextRoundIndex].matches[nextRoundMatchIndex];
          if (childMatch) {
            const childPos = posMap.get(childMatch.matchInternalId);
            if (childPos) {
              const ySpread = (BOX_HEIGHT + VERTICAL_GAP) * Math.pow(2, numRounds - 2 - roundIndex);
              const newY = childPos.y + (matchIndex % 2 === 0 ? -ySpread / 2 : ySpread / 2);
              posMap.set(match.matchInternalId, { x: roundDepths[roundIndex], y: newY });
            }
          }
        }
      });
      calculateY(roundIndex - 1);
    };
    
    calculateY(numRounds - 2);

    // Normalize coordinates to be non-negative
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
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-auto">
       <CardHeader>
          <CardTitle>{scheme.tandingClass || scheme.tgrCategory || "Detail Bagan"}</CardTitle>
          <p className="text-md text-muted-foreground">{`${scheme.type || ''} - ${scheme.ageCategory || ''} | Gel: ${scheme.gelanggangs?.join(', ') || 'N/A'} | Babak: ${scheme.round}`}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative p-10" style={{ height: `${totalHeight + 40}px`, width: `${totalWidth + 40}px` }}>
          <svg className="absolute inset-0 h-full w-full">
            {rounds.map((round, roundIndex) => (
              round.matches.map((match) => {
                const childPos = positions.get(match.matchInternalId);
                if (!childPos || roundIndex === 0) return null; // No connectors for the first round

                // Find parent matches from the previous round
                const prevRound = rounds[roundIndex - 1];
                let parent1 = null;
                let parent2 = null;

                // This logic is complex because the winner's placeholder name links them.
                for (const pMatch of prevRound.matches) {
                    if (match.participant1?.name.includes(`${pMatch.globalMatchNumber}`)) {
                        parent1 = pMatch;
                    }
                    if (match.participant2?.name.includes(`${pMatch.globalMatchNumber}`)) {
                        parent2 = pMatch;
                    }
                }
                
                // If a participant came from a bye, they won't have a parent match generating their name.
                // We find their original entry in the previous round.
                if (!parent1 && match.participant1) {
                    parent1 = prevRound.matches.find(m => m.participant1?.name === match.participant1?.name && m.participant2 === null) || null;
                }
                 if (!parent2 && match.participant2) {
                    parent2 = prevRound.matches.find(m => m.participant1?.name === match.participant2?.name && m.participant2 === null) || null;
                }


                const parent1Pos = parent1 ? positions.get(parent1.matchInternalId) : null;
                const parent2Pos = parent2 ? positions.get(parent2.matchInternalId) : null;

                const lineToChildX = childPos.x;
                const lineToChildY = childPos.y + BOX_HEIGHT / 2;

                const connectors = [];

                if(parent1Pos) {
                  const lineFromParent1X = parent1Pos.x + BOX_WIDTH;
                  const lineFromParent1Y = parent1Pos.y + BOX_HEIGHT / 2;
                  const midPointX = lineFromParent1X + ROUND_GAP / 2;
                  
                  connectors.push(<path key={`conn1-${match.matchInternalId}`} d={`M ${lineFromParent1X} ${lineFromParent1Y} H ${midPointX} V ${lineToChildY} H ${lineToChildX}`} className="fill-none stroke-border" strokeWidth="2" />);
                }
                
                if(parent2Pos) {
                   const lineFromParent2X = parent2Pos.x + BOX_WIDTH;
                   const lineFromParent2Y = parent2Pos.y + BOX_HEIGHT / 2;
                   const midPointX = lineFromParent2X + ROUND_GAP / 2;

                   connectors.push(<path key={`conn2-${match.matchInternalId}`} d={`M ${lineFromParent2X} ${lineFromParent2Y} H ${midPointX} V ${lineToChildY} H ${lineToChildX}`} className="fill-none stroke-border" strokeWidth="2" />);
                }
                
                return connectors;
              })
            ))}
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
      </CardContent>
    </Card>
  );
}
