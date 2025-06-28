
"use client";

import type { Scheme, SchemeMatch } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const BOX_WIDTH = 180;
const BOX_HEIGHT = 56;
const ROUND_GAP = 60;
const VERTICAL_GAP = 24;

interface MatchWithPosition extends SchemeMatch {
  x: number;
  y: number;
}

interface RoundWithPositions extends Omit<SchemeRound, 'matches'> {
  matches: MatchWithPosition[];
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

  const positionedRounds: RoundWithPositions[] = useMemo(() => {
    const rounds = scheme.rounds;
    if (rounds.length === 0) return [];

    const positionedRounds: RoundWithPositions[] = rounds.map(r => ({ ...r, matches: [] }));

    // Position final match
    const finalRound = positionedRounds[rounds.length - 1];
    finalRound.matches.push({
      ...rounds[rounds.length - 1].matches[0],
      x: (rounds.length - 1) * (BOX_WIDTH + ROUND_GAP),
      y: 0,
    });

    // Work backwards to position every other match
    for (let i = rounds.length - 2; i >= 0; i--) {
      const currentRound = rounds[i];
      const nextRound = positionedRounds[i + 1];

      currentRound.matches.forEach((match, matchIndex) => {
        const childMatchIndex = Math.floor(matchIndex / 2);
        const childMatch = nextRound.matches[childMatchIndex];

        const ySpread = Math.pow(2, rounds.length - 1 - (i + 1)) * (BOX_HEIGHT + VERTICAL_GAP);
        const yOffset = (matchIndex % 2 === 0) ? -ySpread : ySpread;
        
        positionedRounds[i].matches.push({
          ...match,
          x: i * (BOX_WIDTH + ROUND_GAP),
          y: childMatch.y + yOffset / 2,
        });
      });
    }

    // Normalize Y coordinates to be positive
    const allYPositions = positionedRounds.flatMap(r => r.matches.map(m => m.y));
    const minY = Math.min(...allYPositions, 0);

    return positionedRounds.map(round => ({
      ...round,
      matches: round.matches.map(match => ({
        ...match,
        y: match.y - minY,
      })),
    }));
  }, [scheme.rounds]);

  const totalHeight = useMemo(() => {
    if (positionedRounds.length === 0) return 0;
    const allY = positionedRounds.flatMap(r => r.matches.map(m => m.y));
    return Math.max(...allY) + BOX_HEIGHT + 40;
  }, [positionedRounds]);

  const totalWidth = useMemo(() => {
    if (positionedRounds.length === 0) return 0;
    return (positionedRounds.length * (BOX_WIDTH + ROUND_GAP)) - ROUND_GAP;
  }, [positionedRounds]);


  return (
    <div className="bg-card text-card-foreground border-border overflow-auto p-4 md:p-10">
      <div className="relative" style={{ height: `${totalHeight}px`, width: `${totalWidth}px` }}>
        <svg className="absolute inset-0 h-full w-full">
            {positionedRounds.map((round, roundIndex) => {
                if (roundIndex === positionedRounds.length - 1) return null; // No lines from final round
                
                const nextRound = positionedRounds[roundIndex + 1];

                return round.matches.map(match => {
                    const parentIndex = round.matches.indexOf(match);
                    const childIndex = Math.floor(parentIndex / 2);
                    const childMatch = nextRound.matches[childIndex];

                    if (!childMatch) return null;

                    const startX = match.x + BOX_WIDTH;
                    const startY = match.y + BOX_HEIGHT / 2;
                    const endX = childMatch.x;
                    const endY = childMatch.y + BOX_HEIGHT / 2;
                    const midX = startX + ROUND_GAP / 2;

                    // If it's a bye (no p2 and p1 has a name), draw a straight line
                    if (match.participant2 === null && match.participant1?.name) {
                         return (
                            <path
                                key={`conn-${match.matchInternalId}`}
                                d={`M ${startX} ${startY} H ${endX}`}
                                className="fill-none stroke-border/70"
                                strokeWidth="2"
                            />
                        );
                    }

                    // Otherwise, draw the classic bracket connector lines
                    return (
                        <path
                            key={`conn-${match.matchInternalId}`}
                            d={`M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`}
                            className="fill-none stroke-border/70"
                            strokeWidth="2"
                        />
                    );
                });
            })}
        </svg>

        {positionedRounds.map((round) => (
          round.matches.map((match) => (
            <div
              key={match.matchInternalId}
              className="absolute group transition-shadow hover:shadow-lg"
              style={{ top: `${match.y}px`, left: `${match.x}px`, width: `${BOX_WIDTH}px`, height: `${BOX_HEIGHT}px` }}
            >
              <div className="relative z-10 flex items-center h-full">
                <span className="absolute -left-6 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-5 flex items-center justify-center text-xs font-sans font-bold border">
                  {match.globalMatchNumber}
                </span>
                <div className={cn(
                    "bg-background rounded-md p-2 border border-border w-full h-full text-xs flex flex-col justify-around",
                    match.participant2 === null && match.participant1?.name && "border-dashed"
                )}>
                  <div className="truncate">
                    <p className="font-semibold">{match.participant1?.name || '(TBD)'}</p>
                    <p className="text-xs text-muted-foreground">{match.participant1?.contingent || ''}</p>
                  </div>
                  { match.participant2 !== null && <div className="border-t border-border/80" /> }
                  <div className="truncate">
                    {match.participant2 !== null && <p className="font-semibold">{match.participant2?.name || '(TBD)'}</p> }
                    {match.participant2 !== null && <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p> }
                    {match.participant2 === null && match.participant1?.name && <p className="font-semibold italic text-muted-foreground">Bye</p>}
                  </div>
                </div>
              </div>
            </div>
          ))
        ))}
      </div>
    </div>
  );
}
