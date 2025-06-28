
"use client";

import type { Scheme, SchemeMatch } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MatchItemProps {
  match: Scheme['rounds'][0]['matches'][0];
}

function MatchItem({ match }: MatchItemProps) {
  return (
    <div className="bg-card rounded-lg p-3 shadow-sm space-y-2 border border-border z-10 relative min-w-[250px]">
      <p className="text-xs text-muted-foreground font-mono flex items-center gap-2">
        <span className="bg-muted text-muted-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-sans">
          {match.globalMatchNumber}
        </span>
      </p>
      <div className="text-sm">
        <p className="font-semibold truncate text-foreground">{match.participant1?.name || '(Belum Ditentukan)'}</p>
        {match.participant1?.contingent && <p className="text-xs text-muted-foreground truncate">{match.participant1.contingent}</p>}
      </div>
      <div className="border-t border-border/50 w-full" />
      <div className="text-sm">
        <p className="font-semibold truncate text-foreground">{match.participant2?.name || '(Belum Ditentukan)'}</p>
        {match.participant2?.contingent && <p className="text-xs text-muted-foreground truncate">{match.participant2.contingent}</p>}
      </div>
    </div>
  );
}


export function BracketView({ scheme }: { scheme: Scheme | null }) {
  if (!scheme) {
    return null;
  }

  if (scheme.type !== 'Tanding' || !scheme.rounds || scheme.rounds.length === 0) {
    return (
      <Card className="mt-8 bg-card text-card-foreground">
        <CardHeader>
          <CardTitle>Bagan Pertandingan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {scheme.type === 'TGR'
              ? `Daftar peserta untuk kategori ${scheme.tgrCategory} (${scheme.ageCategory}) telah berhasil disimpan.`
              : 'Tidak ada pertandingan yang dihasilkan untuk skema ini.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const allMatchesHaveParticipants = scheme.rounds.every(round =>
    round.matches.every(match => match.participant1 && match.participant2)
  );

  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start gap-16 overflow-x-auto p-8 bg-background">
          {scheme.rounds.map((round, roundIndex) => {
            const isFinalRound = roundIndex === scheme.rounds.length - 1;
            const isSemiFinal = roundIndex === scheme.rounds.length - 2;

            const matchGroups = round.matches.reduce((acc, match, index) => {
              if (index % 2 === 0) {
                acc.push([]);
              }
              acc[acc.length - 1].push(match);
              return acc;
            }, [] as SchemeMatch[][]);

            return (
              <div
                key={round.roundNumber}
                className="flex flex-col items-center flex-shrink-0 h-full"
              >
                <h3 className="text-xl font-bold text-center text-primary uppercase shrink-0 min-w-[250px] mb-8">
                  {round.name}
                </h3>
                <div
                  className={cn(
                    'flex flex-col justify-around h-full gap-8',
                    isFinalRound && 'justify-center'
                  )}
                >
                  {matchGroups.map((matchPair, pairIndex) => (
                    <div
                      key={`pair-${pairIndex}`}
                      className={cn(
                        'flex flex-col justify-around gap-8 relative',
                        isSemiFinal && 'first:mb-32 last:mt-32'
                      )}
                    >
                      {matchPair.map((match) => (
                        <div key={match.matchInternalId} className="relative">
                          <MatchItem match={match} />
                          {!isFinalRound && (
                            <div className="absolute top-1/2 left-full w-8 h-px bg-border" />
                          )}
                        </div>
                      ))}
                      {!isFinalRound && matchPair.length > 1 && (
                        <>
                          <div className="absolute top-1/2 left-[calc(100%_+_2rem)] h-full w-px bg-border" />
                          <div className="absolute top-1/2 left-[calc(100%_+_2rem)] w-8 h-px bg-border" />
                        </>
                      )}
                       {!isFinalRound && matchPair.length === 1 && !allMatchesHaveParticipants && (
                         <div className="absolute top-1/2 left-[calc(100%_+_2rem)] w-8 h-px bg-border" />
                       )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
