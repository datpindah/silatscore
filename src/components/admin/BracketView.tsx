
"use client";

import type { Scheme, SchemeMatch, SchemeParticipant } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Crown } from 'lucide-react';
import React from 'react';

interface MatchBoxProps {
  match: SchemeMatch;
  onSetWinner?: (matchId: string, winnerId: string | null) => void;
  isFinal?: boolean;
}

function MatchBox({ match, onSetWinner, isFinal = false }: MatchBoxProps) {
  const handleWinnerClick = (participant: SchemeParticipant | null) => {
    if (!onSetWinner || !participant) return;
    
    // Only allow changing the winner if it's a real match (not a bye)
    if (match.participant1 && match.participant2) {
      onSetWinner(match.id, match.winnerId === participant.id ? null : participant.id);
    }
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

  const renderParticipant = (participant: SchemeParticipant | null) => {
    if (!participant) {
      return (
        <div className="px-2 py-1 h-8 flex items-center" />
      );
    }
    
    const isRealMatch = !!(match.participant1 && match.participant2);
    const isWinner = match.winnerId === participant.id;
    
    // A bye match is not clickable to set/unset winner by user.
    // A real match is clickable only if onSetWinner is provided.
    const isClickable = !!(onSetWinner && isRealMatch);

    return (
      <button
        onClick={() => handleWinnerClick(participant)}
        disabled={!isClickable}
        className={cn(
          "w-full text-left truncate px-2 py-1 h-8 flex flex-col justify-center rounded-sm transition-colors",
          // Only apply winner color if it's a real match with a winner selected.
          // For a bye match, the winner is pre-set but we don't want the color.
          isWinner && isRealMatch ? "bg-accent text-accent-foreground font-bold" : "hover:bg-primary/10",
          !isClickable && "cursor-default"
        )}
      >
        <p className="text-xs font-semibold truncate leading-tight">{participant.name}</p>
        <p className="text-xs text-muted-foreground truncate leading-tight">{participant.contingent}</p>
      </button>
    );
  };

  return (
    <div className="bg-card text-card-foreground border border-border rounded-md shadow-sm w-full h-full flex flex-col justify-around text-sm">
      {renderParticipant(match.participant1)}
      <div className="border-t border-border mx-2 my-0"></div>
      {renderParticipant(match.participant2)}
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

    const roundWidth = 220; // width of match box + gap
    const matchHeight = 72; // height of match box + vertical gap
    const totalWidth = scheme.rounds.length * roundWidth;
    const totalHeight = scheme.rounds[0].matches.length * matchHeight;

    const getMatchPosition = (roundIndex: number, matchIndex: number) => {
        const x = roundIndex * roundWidth;
        const yGap = Math.pow(2, roundIndex) * (matchHeight / 2);
        const y = yGap + matchIndex * (yGap * 2) - (matchHeight / 2);
        return { x, y };
    };

    return (
        <div className="relative overflow-auto p-4 bg-background border rounded-lg">
            <div
                className="relative"
                style={{ width: `${totalWidth}px`, height: `${totalHeight}px` }}
            >
                {scheme.rounds.map((round, roundIndex) => (
                    <React.Fragment key={round.roundNumber}>
                        {round.matches.map((match, matchIndex) => {
                            const { x, y } = getMatchPosition(roundIndex, matchIndex);

                            // Find child match to draw lines to
                            const childMatch = scheme.rounds[roundIndex + 1]?.matches.find(
                                child => child.id === match.nextMatchId
                            );
                            
                            let linePoints: number[] = [];
                            if (childMatch) {
                                const childMatchIndex = scheme.rounds[roundIndex + 1].matches.indexOf(childMatch);
                                const childPos = getMatchPosition(roundIndex + 1, childMatchIndex);
                                
                                const startX = x + (roundWidth - 20); // End of the match box
                                const startY = y + (matchHeight / 2) - 4; // Center of the match box
                                const endX = childPos.x;
                                const endY = childPos.y + (matchHeight / 2) - 4;
                                const midX = startX + (roundWidth / 2) - 10;
                                
                                linePoints = [startX, startY, midX, startY, midX, endY, endX, endY];
                            }
                            
                            return (
                                <React.Fragment key={match.id}>
                                    <div
                                        className="absolute"
                                        style={{
                                            left: `${x}px`,
                                            top: `${y}px`,
                                            width: `${roundWidth - 20}px`,
                                            height: `${matchHeight - 8}px`,
                                        }}
                                    >
                                        <MatchBox
                                            match={match}
                                            onSetWinner={onSetWinner}
                                            isFinal={round.matches.length === 1 && roundIndex === scheme.rounds.length -1}
                                        />
                                    </div>
                                    {linePoints.length > 0 && (
                                        <svg className="absolute top-0 left-0 w-full h-full" style={{ zIndex: -1 }}>
                                            <polyline
                                                points={linePoints.join(' ')}
                                                className="fill-none stroke-border stroke-2"
                                            />
                                        </svg>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
