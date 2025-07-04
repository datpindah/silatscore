"use client";

import React from 'react';
import { type BracketGeneratorOutput } from '@/ai/flows/bracket-generator-flow';

// This interface is local to this component
interface Match {
  id: string;
  participants: (string | null)[];
}

// This interface is local to this component
interface RoundData {
  name: string;
  matches: Match[];
}

// This function processes the data into a more usable format for rendering.
// It shouldn't be changed.
function processBracketData(data: BracketGeneratorOutput | null): RoundData[] {
    if (!data) return [];
    
    const rounds: RoundData[] = [];
    const qualificationMatches = data.pertandinganKualifikasi || [];
    const mainBracketMatches = data.jadwalBabakUtama || [];

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
        
        const lastMainPartai = mainBracketMatches.at(-1)?.partai ?? 0;
        let partaiCounter = lastMainPartai + 1;

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

// A helper to get the match number from its ID
const getMatchNumber = (id: string) => id.split('-').pop() || '';

export function BracketView({ data }: { data: BracketGeneratorOutput | null }) {
    const rounds = processBracketData(data);

    if (rounds.length === 0) {
        return null;
    }

    const baseGapRem = 2; // The gap between match boxes in the first round

    return (
        <div className="bg-gray-800 text-white p-4 md:p-8 rounded-lg mt-6 overflow-x-auto font-sans">
            <div className="flex justify-start items-start min-w-max space-x-12">
                {rounds.map((round, roundIndex) => {
                    // The gap between matches doubles each round to create the tree effect
                    const gapRem = baseGapRem * Math.pow(2, roundIndex + 1);
                    
                    // Add padding to later rounds to vertically align them with the center of the previous round's pairs
                    // 2.25rem is approx half the matchbox height. We add half of the previous round's gap.
                    const paddingTopRem = roundIndex > 0
                        ? (baseGapRem * Math.pow(2, roundIndex) / 2) + 2.25 
                        : 0;

                    return (
                        <div key={round.name} className="relative flex flex-col w-56 flex-shrink-0 pt-10">
                            <h3 className="font-bold text-lg mb-4 text-center text-yellow-400 absolute top-0 w-full">{round.name}</h3>
                            <div 
                                className="relative flex flex-col"
                                style={{
                                    gap: `${gapRem}rem`,
                                    paddingTop: `${paddingTopRem}rem`
                                }}
                            >
                                {round.matches.map((match, matchIndex) => (
                                    <div key={match.id} className="relative">
                                        <div className="relative">
                                            <div className="absolute top-1/2 -left-10 transform -translate-y-1/2 bg-gray-600 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center border-2 border-gray-500 z-20">
                                                {getMatchNumber(match.id)}
                                            </div>
                                            <div className="bg-gray-700 rounded-md shadow-lg w-full border border-gray-600 text-sm flex flex-col z-10">
                                                <div className="px-3 py-2 border-b border-gray-600">
                                                    <p className="text-gray-300 truncate">{match.participants[0] || 'TBD'}</p>
                                                </div>
                                                <div className="px-3 py-2">
                                                    <p className="text-gray-300 truncate">{match.participants[1] || 'BYE'}</p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Connector lines to the next round */}
                                        {roundIndex < rounds.length - 1 && (
                                            <>
                                                {/* Horizontal line coming out of the match box */}
                                                <div className="absolute top-1/2 -right-6 w-6 h-px bg-gray-500 z-0"></div>
                                                
                                                {/* Vertical line connecting pairs & horizontal line to next match */}
                                                {matchIndex % 2 === 0 && (
                                                    <div
                                                        className="absolute w-px bg-gray-500 z-0"
                                                        style={{
                                                            height: `calc(100% + ${gapRem}rem)`, // Height of one box + the gap
                                                            top: '50%',
                                                            right: '-1.5rem',
                                                        }}
                                                    >
                                                        {/* Horizontal line going to the next round's match */}
                                                        <div className="absolute top-1/2 left-0 w-6 h-px bg-gray-500"></div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
