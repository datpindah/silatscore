
"use client";

import type { Scheme } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

function MatchCard({ match }: { match: Scheme['rounds'][0]['matches'][0] }) {
  const p1 = match.participant1;
  const p2 = match.participant2;

  return (
    <div className="bg-card rounded-lg p-2 shadow-sm border border-border w-[220px] text-sm">
      <div className="flex flex-col justify-center h-full">
        <div className="truncate py-1">
          <p className="font-semibold">{p1?.name || '(Pemenang ...)'}</p>
          <p className="text-xs text-muted-foreground">{p1?.contingent || ''}</p>
        </div>
        <div className="border-t border-border my-1" />
        <div className="truncate py-1">
          <p className="font-semibold">{p2?.name || '(Pemenang ...)'}</p>
          <p className="text-xs text-muted-foreground">{p2?.contingent || ''}</p>
        </div>
      </div>
    </div>
  );
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

  return (
    <Card className="mt-8 bg-card text-card-foreground border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-12 lg:gap-20 overflow-x-auto p-6 md:p-10 bg-background/95 min-h-[500px]">
          {scheme.rounds.map((round, roundIndex) => (
            <div key={round.roundNumber} className="flex flex-col justify-center flex-shrink-0">
              <h3 className="text-lg font-bold text-center text-primary uppercase tracking-wider mb-8 h-8">
                {round.name}
              </h3>
              <div
                className="flex flex-col"
                style={{
                  gap: roundIndex === 0 ? '1.5rem' : `${Math.pow(2, roundIndex) * 2.5 - 2.5}rem`,
                }}
              >
                {round.matches.map((match, matchIndex) => (
                  <div key={match.matchInternalId} className="relative">
                    <div className="flex items-center">
                      {/* Match Number */}
                      <span className="absolute -left-7 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full size-6 flex items-center justify-center text-xs font-sans font-bold border z-10">
                        {match.globalMatchNumber}
                      </span>
                      {/* Match Card */}
                      <MatchCard match={match} />
                      {/* Connector Lines to next round */}
                      {roundIndex < scheme.rounds.length - 1 && (
                        <div className="w-6 lg:w-10 h-px bg-border" />
                      )}
                    </div>
                    {/* Vertical Connector between pairs */}
                    {roundIndex < scheme.rounds.length - 1 && matchIndex % 2 === 0 && (
                      <div
                        className="absolute bg-border w-px"
                        style={{
                          height: `calc(100% + ${roundIndex === 0 ? '1.5rem' : `${Math.pow(2, roundIndex) * 2.5 - 2.5}rem`})`,
                          top: '50%',
                          left: `calc(100% + ${1.5 + (roundIndex > 0 ? 1.5 : 0)}rem)`, // Adjust based on gap
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
