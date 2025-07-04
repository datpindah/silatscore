"use client";

import React from 'react';
import { type BracketGeneratorOutput } from '@/ai/flows/bracket-generator-flow';

interface Match {
  id: string;
  participants: (string | null)[];
}

interface RoundData {
  name: string;
  matches: Match[];
}

function processBracketData(data: BracketGeneratorOutput | null): RoundData[] {
    if (!data) return [];
    
    const rounds: RoundData[] = [];
    const qualificationMatches = data.pertandinganKualifikasi || [];
    const mainBracketMatches = data.jadwalBabakUtama || [];

    // Combine all first-round matches, but keep them visually separate if needed.
    // The visual separation can be handled by round names.
    if (qualificationMatches.length > 0) {
        rounds.push({
            name: "Kualifikasi",
            matches: qualificationMatches.map(m => ({
                id: `kualifikasi-${m.partai}`,
                participants: [m.slot1, m.slot2]
            }))
        });
    }

    if (mainBracketMatches.length > 0) {
        let currentMatches = mainBracketMatches.map(m => ({
            id: `partai-${m.partai}`,
            participants: [m.slot1, m.slot2]
        }));
        
        rounds.push({ name: data.babak, matches: currentMatches });
        
        // This counter must be correct, taking the max of both previous rounds
        const lastMainPartai = mainBracketMatches.at(-1)?.partai ?? 0;
        const lastQualPartai = qualificationMatches.at(-1)?.partai ?? 0;
        let partaiCounter = Math.max(lastMainPartai, lastQualPartai) + 1;

        // Generate subsequent rounds
        while (currentMatches.length > 1) {
            const nextRoundMatches: Match[] = [];
            for (let i = 0; i < currentMatches.length; i += 2) {
                const match1 = currentMatches[i];
                const match2 = currentMatches[i + 1];
                nextRoundMatches.push({
                    id: `partai-${partaiCounter++}`,
                    participants: [`Pemenang Partai ${match1.id.split('-').pop()}`, match2 ? `Pemenang Partai ${match2.id.split('-').pop()}` : null]
                });
            }
            
            let roundName = '';
            if (nextRoundMatches.length === 1) roundName = "Final";
            else if (nextRoundMatches.length === 2) roundName = "Semi Final";
            else if (nextRoundMatches.length === 4) roundName = "Perempat Final";
            else roundName = `Babak ${nextRoundMatches.length * 2}`;

            rounds.push({ name: roundName, matches: nextRoundMatches });
            currentMatches = nextRoundMatches;
        }
    }
    
    return rounds;
}

export function BracketView({ data }: { data: BracketGeneratorOutput | null }) {
    const rounds = processBracketData(data);

    if (rounds.length === 0) {
        return null;
    }

    return (
        <div className="bg-gray-800 text-white p-4 md:p-8 rounded-lg mt-6 overflow-x-auto font-sans">
            <div className="flex items-start space-x-8 min-w-max">
                {rounds.map((round, roundIndex) => (
                    <div key={roundIndex} className="flex flex-col flex-shrink-0 w-52">
                        <h3 className="font-bold text-lg mb-6 text-center text-yellow-400">{round.name}</h3>
                        <div className="flex flex-col flex-grow" style={{ justifyContent: 'space-around' }}>
                            {round.matches.map((match, matchIndex) => (
                                <div
                                    key={match.id}
                                    className="relative"
                                    style={{
                                        // Dynamically create space between matches which increases for later rounds
                                        marginTop: matchIndex > 0 ? `${Math.pow(2, roundIndex) * 1.75}rem` : 0
                                    }}
                                >
                                    {/* Match Box */}
                                    <div className="bg-gray-700 rounded-md shadow-lg w-full border border-gray-600 text-sm flex flex-col z-10">
                                        <div className="px-3 py-2 border-b border-gray-600">
                                            <p className="text-gray-300 truncate">{match.participants[0] || 'TBD'}</p>
                                        </div>
                                        <div className="px-3 py-2">
                                            <p className="text-gray-300 truncate">{match.participants[1] || 'BYE'}</p>
                                        </div>
                                    </div>
                                    
                                    {/* Connector to next round */}
                                    {roundIndex < rounds.length - 1 && (
                                        <div className="absolute top-1/2 -right-4 w-4 h-px bg-gray-500 z-0"></div>
                                    )}

                                    {/* Vertical line connecting pairs */}
                                    {roundIndex < rounds.length - 1 && matchIndex % 2 === 0 && (
                                        <div
                                            className="absolute -right-4 w-px bg-gray-500 z-0"
                                            style={{
                                                height: `calc(100% + ${Math.pow(2, roundIndex) * 1.75}rem + 2px)`,
                                                top: '50%',
                                            }}
                                        >
                                            <div className="absolute top-1/2 -right-4 w-4 h-px bg-gray-500"></div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
