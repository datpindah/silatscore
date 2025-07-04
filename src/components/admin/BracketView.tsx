
"use client";

import type { Scheme, SchemeMatch, SchemeParticipant } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Crown } from 'lucide-react';

interface MatchBoxProps {
  match: SchemeMatch;
  participant1: SchemeParticipant | null;
  participant2: SchemeParticipant | null;
  onSetWinner?: (matchId: string, winnerId: string | null) => void;
  isFinal?: boolean;
}

function MatchBox({ match, participant1, participant2, onSetWinner, isFinal = false }: MatchBoxProps) {
  const handleWinnerClick = (participant: SchemeParticipant | null) => {
    if (!onSetWinner || !participant) return;
    
    // Prevent changing winner if a later match is already populated
    // This is a simple guard; more complex logic might be needed
    const isClickable = !match.winnerId;

    if (isClickable) {
      onSetWinner(match.id, participant.id);
    }
  };
  
  const renderParticipant = (participant: SchemeParticipant | null, isTop: boolean) => {
    if (!participant) {
      return (
        <div className="italic text-muted-foreground">
          {isTop ? 'TBD' : 'BYE'}
        </div>
      );
    }
    
    const isWinner = match.winnerId === participant.id;
    const canBeClicked = onSetWinner && !match.winnerId && participant1 && participant2;

    return (
      <button
        onClick={() => handleWinnerClick(participant)}
        disabled={!canBeClicked}
        className={cn(
          "w-full text-left truncate px-2 py-1 rounded-sm transition-colors",
          isWinner ? "bg-accent text-accent-foreground font-bold" : "bg-transparent",
          canBeClicked && "hover:bg-primary/10"
        )}
      >
        <p className="text-xs font-semibold truncate">{participant.name}</p>
        <p className="text-xs text-muted-foreground truncate">{participant.contingent}</p>
      </button>
    );
  };
  
  const finalWinner = match.winnerId && (match.participant1?.id === match.winnerId ? match.participant1 : match.participant2);

  if(isFinal && finalWinner){
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
      {renderParticipant(participant1, true)}
      <div className="border-t border-border mx-2"></div>
      {renderParticipant(participant2, false)}
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

  return (
    <div className="flex overflow-x-auto bg-background p-4 space-x-8 md:space-x-16 snap-x snap-mandatory">
      {scheme.rounds.map((round, roundIndex) => (
        <div key={round.roundNumber} className="flex flex-col justify-around snap-center min-w-[200px]">
           <h3 className="text-center font-headline text-lg font-bold mb-4">{round.name}</h3>
           <div className="space-y-4 relative">
            {round.matches.map((match, matchIndex) => (
              <div key={match.id} className="relative h-16">
                 <MatchBox match={match} participant1={match.participant1} participant2={match.participant2} onSetWinner={onSetWinner} isFinal={round.matches.length === 1 && roundIndex === scheme.rounds.length - 1} />
                 {/* Draw connector lines */}
                 {roundIndex < scheme.rounds.length - 1 && (
                    <>
                      {/* Horizontal line from match to center */}
                      <div className="absolute top-1/2 -right-4 md:-right-8 w-4 md:w-8 h-px bg-border"></div>
                      {/* Vertical line connecting pairs */}
                      {matchIndex % 2 === 0 && (
                        <div className="absolute top-full -right-4 md:-right-8 w-px h-10 bg-border"></div>
                      )}
                      {/* Horizontal line from center to next match */}
                       {matchIndex % 2 === 0 && (
                          <div className="absolute top-[calc(100%_+_20px)] -right-4 md:-right-8 w-4 md:w-8 h-px bg-border"></div>
                       )}
                    </>
                 )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
