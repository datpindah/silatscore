// @/ai/flows/bracket-generator-flow.ts
'use server';
/**
 * @fileOverview Generates a single-elimination tournament bracket structure.
 *
 * - generateBracket - A function that creates a bracket based on participant count and names.
 * - BracketGeneratorInput - The input type for the generateBracket function.
 * - BracketGeneratorOutput - The return type for the generateBracket function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const BracketGeneratorInputSchema = z.object({
  participantCount: z.number().int().min(3).max(32).describe('The total number of participants.'),
  participantList: z.array(z.string()).describe('An ordered list of participant names.'),
});
export type BracketGeneratorInput = z.infer<typeof BracketGeneratorInputSchema>;

const BracketGeneratorOutputSchema = z.object({
  totalPeserta: z.number().int().describe('Total number of participants.'),
  babak: z.string().describe('The main bracket round (e.g., "8 besar", "16 besar").'),
  slotIdeal: z.number().int().describe('The ideal number of slots for the bracket size (a power of 2).'),
  jumlahPertandinganKualifikasi: z.number().int().describe('The number of qualification matches.'),
  jumlahBye: z.number().int().describe('The number of participants who get a bye directly into the main bracket.'),
  pesertaBye: z.array(z.string()).describe('List of participants who received a bye.'),
  pesertaKualifikasi: z.array(z.string()).describe('List of participants who must play in a qualification round.'),
  pertandinganKualifikasi: z.array(z.object({
    partai: z.number().int().describe('Match number.'),
    slot1: z.string().describe('Participant in slot 1.'),
    slot2: z.string().describe('Participant in slot 2.'),
  })).describe('The schedule for the qualification round.'),
  pesertaLolosLangsung: z.array(z.string()).describe('List of participants who advance directly to the main bracket (same as pesertaBye).'),
  jadwalBabakUtama: z.array(z.object({
    partai: z.number().int().describe('Match number in the main bracket.'),
    slot1: z.string().describe('Participant or winner placeholder for slot 1.'),
    slot2: z.string().describe('Participant or winner placeholder for slot 2.'),
  })).describe('The schedule for the main bracket.'),
});
export type BracketGeneratorOutput = z.infer<typeof BracketGeneratorOutputSchema>;

export async function generateBracket(input: BracketGeneratorInput): Promise<BracketGeneratorOutput> {
  return generateBracketFlow(input);
}

// Helper function to find the largest power of 2 less than or equal to a number
function largestPowerOf2(n: number): number {
    let p = 1;
    while (p * 2 <= n) {
        p *= 2;
    }
    return p;
}

const generateBracketFlow = ai.defineFlow(
  {
    name: 'generateBracketFlow',
    inputSchema: BracketGeneratorInputSchema,
    outputSchema: BracketGeneratorOutputSchema,
  },
  async (input) => {
    const { participantList } = input;
    const totalPeserta = participantList.length;

    if (totalPeserta < 3) {
        throw new Error("Minimum 3 participants required.");
    }

    // 1. Determine target bracket size
    const isPowerOfTwo = (totalPeserta & (totalPeserta - 1)) === 0;
    const targetBracketSize = isPowerOfTwo ? totalPeserta : largestPowerOf2(totalPeserta);

    const babak = `${targetBracketSize} Besar`;
    const slotIdeal = targetBracketSize;

    // 2. Calculate qualification matches and byes
    let jumlahPertandinganKualifikasi = 0;
    let pesertaKualifikasi: string[] = [];
    let pesertaBye: string[] = [];

    if (!isPowerOfTwo) {
         jumlahPertandinganKualifikasi = totalPeserta - targetBracketSize;
         const jumlahPesertaKualifikasi = jumlahPertandinganKualifikasi * 2;
         const jumlahByeInternal = totalPeserta - jumlahPesertaKualifikasi;
         pesertaBye = participantList.slice(0, jumlahByeInternal);
         pesertaKualifikasi = participantList.slice(jumlahByeInternal);
    } else {
        // If it's a power of two, everyone is a "bye" to the main bracket, no qualification
        pesertaBye = [...participantList];
    }

    const jumlahBye = pesertaBye.length;
    const pesertaLolosLangsung = [...pesertaBye];

    // 3. Create qualification matches
    const pertandinganKualifikasi: {partai: number, slot1: string, slot2: string}[] = [];
    for (let i = 0; i < jumlahPertandinganKualifikasi; i++) {
        pertandinganKualifikasi.push({
            partai: i + 1,
            slot1: pesertaKualifikasi[i * 2],
            slot2: pesertaKualifikasi[i * 2 + 1],
        });
    }
    
    // 4. Prepare entities for main bracket
    const mainBracketEntities: string[] = [...pesertaBye];
    for (let i = 0; i < jumlahPertandinganKualifikasi; i++) {
        mainBracketEntities.push(`Pemenang Kualifikasi ${i + 1}`);
    }
    
    // 5. Create main bracket matches using standard seeding (1 vs last, 2 vs 2nd last, etc.)
    const jadwalBabakUtama: {partai: number, slot1: string, slot2: string}[] = [];
    const numMatchesInMainRound = mainBracketEntities.length / 2;
    let partaiCounter = 1;

    for (let i = 0; i < numMatchesInMainRound; i++) {
        jadwalBabakUtama.push({
            partai: partaiCounter++,
            slot1: mainBracketEntities[i],
            slot2: mainBracketEntities[mainBracketEntities.length - 1 - i],
        });
    }
    
    return {
        totalPeserta,
        babak,
        slotIdeal,
        jumlahPertandinganKualifikasi,
        jumlahBye,
        pesertaBye,
        pesertaKualifikasi,
        pertandinganKualifikasi,
        pesertaLolosLangsung,
        jadwalBabakUtama,
    };
  }
);
