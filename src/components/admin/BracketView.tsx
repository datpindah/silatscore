
"use client";

import type { Scheme, SchemeMatch, SchemeParticipant } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Crown } from 'lucide-react';
import React, { useMemo } from 'react';

interface MatchBoxProps {
  match: SchemeMatch;
  onSetWinner?: (matchId: string, winnerId: string | null) => void;
  isFinal?: boolean;
}

function MatchBox({ match, onSetWinner, isFinal = false }: MatchBoxProps) {
  const handleWinnerClick = (participant: SchemeParticipant | null) => {
    if (!onSetWinner || !participant) return;
    
    // Allow clicking only if there's no winner yet
    if (!match.winnerId) {
      onSetWinner(match.id, participant.id);
    }
  };
  
  const renderParticipant = (participant: SchemeParticipant | null, isTop: boolean) => {
    if (!participant) {
      return (
        <div className="italic text-muted-foreground px-2 py-1 h-8 flex items-center">
          {isTop ? '' : 'BYE'}
        </div>
      );
    }
    
    const isWinner = match.winnerId === participant.id;
    const canBeClicked = onSetWinner && !match.winnerId && match.participant1 && match.participant2;

    return (
      <button
        onClick={() => handleWinnerClick(participant)}
        disabled={!canBeClicked}
        className={cn(
          "w-full text-left truncate px-2 py-1 h-8 flex flex-col justify-center rounded-sm transition-colors",
          isWinner ? "bg-accent text-accent-foreground font-bold" : "hover:bg-primary/10",
          !canBeClicked && "cursor-default"
        )}
      >
        <p className="text-xs font-semibold truncate leading-tight">{participant.name}</p>
        <p className="text-xs text-muted-foreground truncate leading-tight">{participant.contingent}</p>
      </button>
    );
  };
  
  const finalWinner = match.winnerId && (match.participant1?.id === match.winnerId ? match.participant1 : match.participant2);

  if (isFinal && finalWinner) {
    return (
       <div className="flex flex-col items-center justify-center h-full w-full">
         <Crown className="w-8 h-8 text-yellow-500 mb-1" />
         <p className="text-lg font-bold truncate">{finalWinner.name}</p>
         <p className="text-sm text-muted-foreground truncate">{finalWinner.contingent}</p>
       </div>
    );
  }

  return (
    <div className="bg-card text-card-foreground border border-border rounded-md shadow-sm w-full h-full flex flex-col justify-around text-sm">
      {renderParticipant(match.participant1, true)}
      <div className="border-t border-border mx-2 my-0"></div>
      {renderParticipant(match.participant2, false)}
    </div>
  );
}


interface BracketViewProps {
    scheme: Scheme | null;
    onSetWinner?: (matchId: string, winnerId: string | null) => void;
}

export function BracketView({ scheme, onSetWinner }: BracketViewProps) {
  if (!scheme || !scheme.rounds || scheme.rounds.length === 0) {
    if(scheme?.type === 'TGR'){
      return (
        <div className="bg-card text-card-foreground p-4 rounded-lg border">
          <h3 className="font-semibold">Daftar Peserta TGR</h3>
           <ul className="list-decimal pl-5 mt-2">
              {scheme.participants.map(p => (
                  <li key={p.id}>{p.name} ({p.contingent})</li>
              ))}
           </ul>
        </div>
      );
    }
    return <p>Skema ini tidak memiliki pertandingan untuk ditampilkan.</p>;
  }

  const { rounds, positions, lines } = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const lines: JSX.Element[] = [];
    const COLUMN_WIDTH = 220; // width of match box + gap
    const MATCH_HEIGHT = 64;
    const MATCH_GAP = 24;

    const rounds = [...scheme.rounds];
    const finalRound = rounds[rounds.length - 1];
    
    // Position the final match centrally
    if(finalRound.matches.length === 1) {
      const finalMatch = finalRound.matches[0];
      const totalHeight = (Math.pow(2, rounds.length - 1)) * (MATCH_HEIGHT + MATCH_GAP);
      positions.set(finalMatch.id, { x: (rounds.length - 1) * COLUMN_WIDTH, y: totalHeight / 2 - MATCH_HEIGHT / 2 });
    }
    
    // Position previous rounds based on their children
    for (let i = rounds.length - 2; i >= 0; i--) {
      const currentRound = rounds[i];
      currentRound.matches.forEach(match => {
        if (match.nextMatchId) {
          const childPos = positions.get(match.nextMatchId);
          if (childPos) {
            const matchIndexInParentRound = currentRound.matches.findIndex(m => m.id === match.id);
            const pairIndex = Math.floor(matchIndexInParentRound / 2);
            
            const yOffset = (matchIndexInParentRound % 2 === 0) 
              ? -((MATCH_HEIGHT + MATCH_GAP) / 2) 
              : ((MATCH_HEIGHT + MATCH_GAP) / 2);

            let verticalMultiplier = 1;
            for(let j=i+1; j < rounds.length - 1; j++){
                verticalMultiplier *= 2;
            }

            positions.set(match.id, {
              x: i * COLUMN_WIDTH,
              y: childPos.y + (yOffset * verticalMultiplier),
            });
          }
        } else if(currentRound.matches.length === 1) { // Single match in a round (like a play-in)
           positions.set(match.id, { x: i * COLUMN_WIDTH, y: 0 });
        }
      });
    }

    // Generate lines based on positions
    rounds.forEach((round, roundIndex) => {
      if (roundIndex === rounds.length - 1) return;
      
      round.matches.forEach(match => {
        if (!match.nextMatchId) return;

        const parentPos = positions.get(match.id);
        const childPos = positions.get(match.nextMatchId);
        
        if (!parentPos || !childPos) return;

        const isTopParent = round.matches.findIndex(m => m.nextMatchId === match.nextMatchId) === match.id;
        
        const lineStartX = parentPos.x + (COLUMN_WIDTH - 20);
        const lineStartY = parentPos.y + MATCH_HEIGHT / 2;

        const lineEndX = childPos.x;
        const lineEndY = childPos.y + MATCH_HEIGHT / 2;
        
        // Find sibling
        const siblingMatch = round.matches.find(m => m.nextMatchId === match.nextMatchId && m.id !== match.id);
        const siblingPos = siblingMatch ? positions.get(siblingMatch.id) : null;
        
        const midPointX = lineStartX + (COLUMN_WIDTH - 20) / 2;

        if (siblingPos) { // It's a pair
            const y1 = lineStartY;
            const y2 = siblingPos.y + MATCH_HEIGHT / 2;
            const midPointY = (y1 + y2) / 2;
            
            // only draw the full connector for the top match of the pair
            if (y1 < y2) {
                lines.push(
                    <path
                        key={`conn-${match.id}`}
                        d={`M ${lineStartX} ${y1} H ${midPointX} M ${lineStartX} ${y2} H ${midPointX} M ${midPointX} ${y1} V ${y2} M ${midPointX} ${midPointY} H ${lineEndX}`}
                        className="fill-none stroke-border stroke-2"
                    />
                );
            }
        } else { // It's a BYE, draw straight line
             lines.push(
                <path
                    key={`conn-${match.id}`}
                    d={`M ${lineStartX} ${lineStartY} H ${lineEndX}`}
                    className="fill-none stroke-border stroke-2"
                />
            );
        }
      });
    });


    return { rounds, positions, lines };
  }, [scheme]);


  return (
    <div className="relative overflow-auto p-4 bg-background">
      <div 
        className="relative"
        style={{ height: `${(Math.pow(2, rounds.length - 1)) * (64 + 24)}px` }}
      >
        <svg className="absolute top-0 left-0 w-full h-full" style={{ zIndex: 0 }}>
          {lines}
        </svg>

        {rounds.map((round) => (
          <div key={round.roundNumber} className="absolute top-0 left-0 h-full">
            {round.matches.map((match) => {
              const pos = positions.get(match.id);
              if (!pos) return null;
              return (
                <div
                  key={match.id}
                  className="absolute"
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    width: `200px`,
                    height: `64px`
                  }}
                >
                  <MatchBox match={match} onSetWinner={onSetWinner} isFinal={round.matches.length === 1 && round.roundNumber === rounds[rounds.length -1].roundNumber} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
