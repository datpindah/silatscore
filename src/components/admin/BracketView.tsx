"use client";

import type { Scheme, SchemeMatch } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const BOX_WIDTH = 180;
const BOX_HEIGHT = 56;
const ROUND_GAP = 60;
const VERTICAL_GAP = 24;

interface PositionedMatch extends SchemeMatch {
  x: number;
  y: number;
}

interface BracketLine {
  key: string;
  d: string;
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

  const { positionedMatches, lines, totalHeight, totalWidth } = useMemo(() => {
    const rounds = scheme.rounds;
    if (!rounds.length) return { positionedMatches: [], lines: [], totalHeight: 0, totalWidth: 0 };

    const positions = new Map<string, { x: number; y: number }>();
    const generatedLines: BracketLine[] = [];

    // 1. Position first round matches
    rounds[0].matches.forEach((match, index) => {
      positions.set(match.matchInternalId, {
        x: 0,
        y: index * (BOX_HEIGHT + VERTICAL_GAP),
      });
    });

    // 2. Position subsequent rounds based on the average Y of their parent matches
    for (let i = 1; i < rounds.length; i++) {
      const currentRound = rounds[i];
      const prevRound = rounds[i - 1];

      currentRound.matches.forEach((match) => {
        const parentSources: SchemeMatch[] = [];

        [match.participant1, match.participant2].forEach(p => {
          if (!p) return;

          if (p.name.startsWith('Pemenang Partai ')) {
            const parentMatchNumber = parseInt(p.name.replace('Pemenang Partai ', ''), 10);
            const parentMatch = prevRound.matches.find(m => m.globalMatchNumber === parentMatchNumber);
            if (parentMatch) parentSources.push(parentMatch);
          } else {
            // This is for byes
            const parentMatch = prevRound.matches.find(m => m.participant1?.name === p.name && m.participant2 === null);
            if (parentMatch) parentSources.push(parentMatch);
          }
        });

        if (parentSources.length > 0) {
          const parentPositions = parentSources.map(ps => positions.get(ps.matchInternalId)).filter(Boolean) as { x: number, y: number }[];
          if (parentPositions.length > 0) {
            const avgY = parentPositions.reduce((sum, pos) => sum + pos.y, 0) / parentPositions.length;
            positions.set(match.matchInternalId, {
              x: i * (BOX_WIDTH + ROUND_GAP),
              y: avgY,
            });
          }
        }
      });
    }

    // 3. Draw lines connecting the positioned matches
    const allMatches = rounds.flatMap(r => r.matches);
    for (let i = 0; i < rounds.length - 1; i++) {
        const currentRound = rounds[i];
        const nextRound = rounds[i + 1];

        currentRound.matches.forEach(parentMatch => {
            const parentPos = positions.get(parentMatch.matchInternalId);
            if (!parentPos) return;

            const winnerPlaceholder = `Pemenang Partai ${parentMatch.globalMatchNumber}`;
            const childMatch = nextRound.matches.find(child => 
                child.participant1?.name === winnerPlaceholder || 
                child.participant2?.name === winnerPlaceholder
            );

            // This logic is for Byes that are not placeholders
            if (!childMatch && parentMatch.participant2 === null) {
                 const directChild = nextRound.matches.find(child => 
                    child.participant1?.name === parentMatch.participant1?.name || 
                    child.participant2?.name === parentMatch.participant1?.name
                );
                 if(directChild){
                    const childPos = positions.get(directChild.matchInternalId);
                    if(childPos){
                        generatedLines.push({
                            key: `line-bye-${parentMatch.matchInternalId}`,
                            d: `M ${parentPos.x + BOX_WIDTH} ${parentPos.y + BOX_HEIGHT / 2} H ${childPos.x}`
                        });
                    }
                 }
                 return; // continue to next parentMatch
            }

            if (!childMatch) return;

            const childPos = positions.get(childMatch.matchInternalId);
            if (!childPos) return;

            const startX = parentPos.x + BOX_WIDTH;
            const startY = parentPos.y + BOX_HEIGHT / 2;
            const endX = childPos.x;
            const midX = startX + ROUND_GAP / 2;
            
            generatedLines.push({
                key: `line-horz-${parentMatch.matchInternalId}`,
                d: `M ${startX} ${startY} H ${midX}`
            });

            const allParentsOfChild = [childMatch.participant1, childMatch.participant2]
                .map(p => {
                    if (p?.name.startsWith('Pemenang Partai ')) {
                         const num = parseInt(p.name.replace('Pemenang Partai ', ''), 10);
                         return allMatches.find(m => m.globalMatchNumber === num);
                    }
                    return null;
                })
                .filter(Boolean) as SchemeMatch[];
            
            if (allParentsOfChild.length === 2 && allParentsOfChild[1].matchInternalId === parentMatch.matchInternalId) {
                 const otherParentPos = positions.get(allParentsOfChild[0].matchInternalId);
                 if(otherParentPos){
                     const y1 = otherParentPos.y + BOX_HEIGHT / 2;
                     const y2 = parentPos.y + BOX_HEIGHT / 2;
                     const childMidY = childPos.y + BOX_HEIGHT / 2;
                     generatedLines.push({
                        key: `line-vert-${childMatch.matchInternalId}`,
                        d: `M ${midX} ${Math.min(y1, y2)} V ${Math.max(y1, y2)}`
                     });
                     generatedLines.push({
                        key: `line-child-${childMatch.matchInternalId}`,
                        d: `M ${midX} ${childMidY} H ${endX}`
                     });
                 }
            }
        });
    }

    const allPositionedMatches: PositionedMatch[] = [];
    rounds.forEach(round => {
      round.matches.forEach(match => {
        const pos = positions.get(match.matchInternalId);
        if (pos) {
          allPositionedMatches.push({ ...match, ...pos });
        }
      });
    });

    const finalHeight = (rounds[0].matches.length * (BOX_HEIGHT + VERTICAL_GAP));
    const finalWidth = rounds.length * (BOX_WIDTH + ROUND_GAP) - ROUND_GAP;
    
    return { 
        positionedMatches: allPositionedMatches, 
        lines: generatedLines, 
        totalHeight: finalHeight, 
        totalWidth: finalWidth 
    };

  }, [scheme]);

  return (
    <div className="bg-card text-card-foreground border-border overflow-auto p-4 md:p-10">
      <div className="relative" style={{ height: `${totalHeight}px`, width: `${totalWidth}px` }}>
        <svg className="absolute inset-0 h-full w-full" style={{ strokeWidth: 2 }}>
            {lines.map(line => (
                <path
                    key={line.key}
                    d={line.d}
                    className="fill-none stroke-border/80"
                />
            ))}
        </svg>

        {positionedMatches.map((match) => (
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
                { match.participant2 !== null && <div className="border-t border-border/80 my-1" /> }
                <div className="truncate">
                  {match.participant2 !== null && <p className="font-semibold">{match.participant2?.name || '(TBD)'}</p> }
                  {match.participant2 !== null && <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p> }
                  {match.participant2 === null && match.participant1?.name && <p className="font-semibold italic text-muted-foreground">Bye</p>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
