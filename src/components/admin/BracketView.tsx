
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MatchItemProps {
  match: Scheme['rounds'][0]['matches'][0];
}

function MatchItem({ match }: MatchItemProps) {
  return (
    <div className="bg-card rounded-lg p-3 shadow-sm border border-border z-10 relative min-w-[250px] space-y-2">
      <div className="flex items-center gap-3">
        <span className="bg-muted text-muted-foreground rounded-full size-6 flex items-center justify-center text-xs font-sans font-bold">
          {match.globalMatchNumber}
        </span>
        <div className="flex-1">
          <p className="font-semibold truncate text-foreground">{match.participant1?.name || '...'}</p>
          {match.participant1?.contingent && <p className="text-xs text-muted-foreground truncate">{match.participant1.contingent}</p>}
        </div>
      </div>
      <div className="pl-9"><div className="border-t border-border/50 w-full" /></div>
      <div className="flex items-center gap-3">
        {/* Placeholder for alignment with the number above */}
        <span className="rounded-full size-6 flex items-center justify-center font-sans font-bold opacity-0" aria-hidden="true">
          .
        </span>
        <div className="flex-1">
          <p className="font-semibold truncate text-foreground">{match.participant2?.name || '...'}</p>
          {match.participant2?.contingent && <p className="text-xs text-muted-foreground truncate">{match.participant2.contingent}</p>}
        </div>
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
              ? `Daftar peserta untuk kategori ${scheme.tgrCategory || ''} (${scheme.ageCategory}) telah berhasil disimpan.`
              : 'Tidak ada pertandingan yang dihasilkan untuk skema ini.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start gap-16 overflow-x-auto p-8 bg-background">
          {scheme.rounds.map((round, roundIndex) => {
            const isFinal = roundIndex === scheme.rounds.length - 1;
            const groupedMatches = round.matches.reduce((acc, _, index, array) => {
              if (index % 2 === 0) acc.push(array.slice(index, index + 2));
              return acc;
            }, [] as (typeof round.matches)[]);

            return (
              <div key={round.roundNumber} className="flex flex-col justify-around h-full flex-shrink-0">
                <h3 className="text-xl font-bold text-center text-primary uppercase mb-8 shrink-0 min-w-[250px]">
                  {round.name}
                </h3>
                <div className="flex flex-col justify-around h-full gap-24">
                  {groupedMatches.map((pair, pairIndex) => (
                    <div key={pairIndex} className="relative">
                      <div className="flex flex-col gap-12">
                        {pair.map(match => <MatchItem key={match.matchInternalId} match={match} />)}
                      </div>
                      {!isFinal && pair.length > 1 && (
                        <>
                          {/* Top horizontal line */}
                          <div className="absolute top-[25%] left-full w-8 h-px bg-border -translate-y-1/2" />
                          {/* Bottom horizontal line */}
                          <div className="absolute bottom-[25%] left-full w-8 h-px bg-border translate-y-1/2" />
                          {/* Vertical connector */}
                          <div className="absolute top-[25%] left-[calc(100%_+_2rem)] h-1/2 w-px bg-border" />
                          {/* Horizontal line to next round */}
                          <div className="absolute top-1/2 left-[calc(100%_+_2rem)] w-8 h-px bg-border" />
                        </>
                      )}
                      {/* Connector for a single match in a pair (bye) */}
                      {!isFinal && pair.length === 1 && (
                        <div className="absolute top-1/2 left-full w-8 h-px bg-border" />
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
