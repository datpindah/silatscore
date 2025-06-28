
"use client";

import type { Scheme, SchemeMatch, SchemeRound } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fragment } from 'react';

const BOX_WIDTH = 220;
const BOX_HEIGHT = 80;
const ROUND_GAP = 90; // Horizontal gap between rounds
const VERTICAL_GAP = 50; // Vertical gap between matches in the same round

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

  const prelimRoundIndex = scheme.rounds.findIndex(r => r.name === 'Babak Penyisihan');
  const hasPrelim = prelimRoundIndex !== -1;
  const mainDrawRounds = hasPrelim ? scheme.rounds.slice(prelimRoundIndex + 1) : scheme.rounds;

  const positions = new Map<string, { x: number; y: number }>();
  let totalHeight = 0;

  // Calculate positions for the main draw rounds
  const calculatePositions = (rounds: SchemeRound[]) => {
    if (rounds.length === 0) return;
    
    let y_coords: number[] = [];
    const lastRound = rounds[rounds.length - 1];
    
    // Position the final match first
    const finalMatchY = 0;
    positions.set(lastRound.matches[0].matchInternalId, { x: (rounds.length - 1) * (BOX_WIDTH + ROUND_GAP), y: finalMatchY });
    y_coords = [finalMatchY];
    
    // Work backwards from the final
    for (let i = rounds.length - 2; i >= 0; i--) {
      const round = rounds[i];
      const new_y_coords: number[] = [];
      round.matches.forEach((match, matchIndex) => {
        const parentY = y_coords[Math.floor(matchIndex / 2)];
        const y = parentY + (matchIndex % 2 === 0 ? -1 : 1) * (Math.pow(2, rounds.length - 2 - i) * (BOX_HEIGHT + VERTICAL_GAP)) / 2;
        positions.set(match.matchInternalId, { x: i * (BOX_WIDTH + ROUND_GAP), y });
        new_y_coords.push(y);
      });
      y_coords = new_y_coords;
    }

    // Determine total height for canvas
    const minY = Math.min(...Array.from(positions.values()).map(p => p.y));
    const maxY = Math.max(...Array.from(positions.values()).map(p => p.y));
    totalHeight = maxY - minY + BOX_HEIGHT;

    // Normalize positions to be positive
    for (const [key, pos] of positions.entries()) {
      positions.set(key, { ...pos, y: pos.y - minY });
    }
  };

  calculatePositions(mainDrawRounds);

  // Position preliminary round matches
  if (hasPrelim) {
    const prelimRound = scheme.rounds[prelimRoundIndex];
    let prelimYOffset = positions.get(mainDrawRounds[0].matches[0].matchInternalId)?.y ?? 0;

    prelimRound.matches.forEach((match) => {
      // Find where this prelim match winner goes
      const placeholder = `Pemenang Partai ${match.globalMatchNumber}`;
      let destPos: { x: number; y: number } | undefined;
      let destSlot: 'top' | 'bottom' = 'top';

      for (const mainMatch of mainDrawRounds[0].matches) {
        if (mainMatch.participant1?.name === placeholder) {
          destPos = positions.get(mainMatch.matchInternalId);
          destSlot = 'top';
          break;
        }
        if (mainMatch.participant2?.name === placeholder) {
          destPos = positions.get(mainMatch.matchInternalId);
          destSlot = 'bottom';
          break;
        }
      }
      
      if (destPos) {
        const destY = destPos.y + (destSlot === 'top' ? BOX_HEIGHT * 0.25 : BOX_HEIGHT * 0.75);
        positions.set(match.matchInternalId, { x: - (BOX_WIDTH + ROUND_GAP), y: destY - (BOX_HEIGHT / 2)});
      }
    });
  }


  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="relative p-10" style={{ height: `${totalHeight + 100}px` }}>
          {scheme.rounds.map((round) => (
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
                            <p className="font-semibold">{match.participant2?.name || 'Pemenang ...'}</p>
                            <p className="text-xs text-muted-foreground">{match.participant2?.contingent || ''}</p>
                          </div>
                      </div>
                    </div>
                </div>
              );
            })
          ))}
          
          {/* Render Connectors */}
          {mainDrawRounds.slice(1).map((round, roundIndex) => (
            round.matches.map((match) => {
              const childPos = positions.get(match.matchInternalId);
              if (!childPos) return null;

              const parentMatch1 = mainDrawRounds[roundIndex].matches[2 * round.matches.indexOf(match)];
              const parentMatch2 = mainDrawRounds[roundIndex].matches[2 * round.matches.indexOf(match) + 1];
              
              const parent1Pos = positions.get(parentMatch1.matchInternalId);
              const parent2Pos = positions.get(parentMatch2.matchInternalId);

              if (!parent1Pos || !parent2Pos) return null;

              const lineY1 = parent1Pos.y + BOX_HEIGHT / 2;
              const lineY2 = parent2Pos.y + BOX_HEIGHT / 2;
              const lineX = parent1Pos.x + BOX_WIDTH;
              const midPointX = lineX + ROUND_GAP / 2;
              const midPointY = (lineY1 + lineY2) / 2;

              return (
                <Fragment key={`conn-${match.matchInternalId}`}>
                  {/* H-line from parent 1 */}
                  <div className="bg-border absolute" style={{ top: `${lineY1 - 1}px`, left: `${lineX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }}/>
                  {/* H-line from parent 2 */}
                  <div className="bg-border absolute" style={{ top: `${lineY2 - 1}px`, left: `${lineX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }}/>
                  {/* V-line connecting parents */}
                  <div className="bg-border absolute" style={{ top: `${lineY1}px`, left: `${midPointX - 1}px`, width: '2px', height: `${lineY2 - lineY1}px` }}/>
                  {/* H-line to child */}
                  <div className="bg-border absolute" style={{ top: `${midPointY - 1}px`, left: `${midPointX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }}/>
                </Fragment>
              );
            })
          ))}

           {/* Preliminary Connectors */}
           {hasPrelim && scheme.rounds[prelimRoundIndex].matches.map(prelimMatch => {
                const prelimPos = positions.get(prelimMatch.matchInternalId);
                if (!prelimPos) return null;

                const placeholder = `Pemenang Partai ${prelimMatch.globalMatchNumber}`;
                let destPos: { x: number; y: number } | undefined;
                let destSlot: 'top' | 'bottom' = 'top';

                for (const mainMatch of mainDrawRounds[0].matches) {
                    if (mainMatch.participant1?.name === placeholder) {
                        destPos = positions.get(mainMatch.matchInternalId);
                        destSlot = 'top';
                        break;
                    }
                    if (mainMatch.participant2?.name === placeholder) {
                        destPos = positions.get(mainMatch.matchInternalId);
                        destSlot = 'bottom';
                        break;
                    }
                }
                if (!destPos) return null;

                const sourceY = prelimPos.y + BOX_HEIGHT / 2;
                const destY = destPos.y + (destSlot === 'top' ? BOX_HEIGHT * 0.25 : BOX_HEIGHT * 0.75);
                
                const sourceX = prelimPos.x + BOX_WIDTH;
                const midX = sourceX + ROUND_GAP / 2;

                return (
                    <Fragment key={`conn-${prelimMatch.matchInternalId}`}>
                        <div className="bg-border absolute" style={{ top: `${sourceY - 1}px`, left: `${sourceX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }} />
                        <div className="bg-border absolute" style={{ top: `${Math.min(sourceY, destY)}px`, left: `${midX - 1}px`, width: '2px', height: `${Math.abs(sourceY - destY)+2}px` }} />
                        <div className="bg-border absolute" style={{ top: `${destY - 1}px`, left: `${midX}px`, width: `${ROUND_GAP / 2}px`, height: '2px' }} />
                    </Fragment>
                )
           })}

        </div>
      </CardContent>
    </Card>
  );
}
