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

const bracketGeneratorPrompt = ai.definePrompt({
  name: 'bracketGeneratorPrompt',
  input: {schema: BracketGeneratorInputSchema},
  output: {schema: BracketGeneratorOutputSchema},
  prompt: `You are an expert tournament organizer. Your task is to generate a detailed JSON structure for a single-elimination tournament based on a given number of participants and their names.

You MUST follow these specific rules for the number of participants. The input list of participants is already ordered by seed.

**General Rules:**
1.  The main bracket is either "4 besar" (for 3-7 participants), "8 besar" (for 8-15 participants), or "16 besar" (for 16-32 participants). For 8 or 16 or 32 participants, there is no qualification round.
2.  If the number of participants is not a power of 2, some participants will play a "kualifikasi" round to enter the main bracket, while others get a "bye" and wait in the main bracket.
3.  Participants who get a "bye" are always taken from the top of the input list ('participantList').
4.  The remaining participants play in the qualification round, paired sequentially from the top of their sub-list.
5.  In the main bracket, the "bye" participants are seeded at the top. They will play against the winners of the qualification round or against other "bye" participants if there are more byes than qualification winners.
6.  The 'pesertaLolosLangsung' array is identical to the 'pesertaBye' array.

**CRITICAL RULE: Each participant name from 'participantList' may only appear ONCE in the initial bracket setup ('pertandinganKualifikasi' and 'jadwalBabakUtama' combined). A participant cannot be in two places at once. Double-check your output to ensure no participant is listed in more than one starting match.**

**Specific Scenarios (MUST be followed exactly):**

*   **9 Peserta (Target: 8 Besar):** 7 byes, 2 kualifikasi (1 match). The top 7 participants are 'pesertaBye'. The remaining 2 are 'pesertaKualifikasi'. In the 8-person bracket, 6 of the bye participants play each other, and 1 bye participant plays the winner of the qualification match.
*   **10 Peserta (Target: 8 Besar):** 6 byes, 4 kualifikasi (2 matches). Top 2 byes await winners. Other 4 byes play each other.
*   **11 Peserta (Target: 8 Besar):** 5 byes, 6 kualifikasi (3 matches). Top 3 byes await winners. Other 2 byes play each other.
*   **12 Peserta (Target: 8 Besar):** 4 byes, 8 kualifikasi (4 matches). The 4 byes await the 4 winners.
*   **13 Peserta (Target: 8 Besar):** 3 byes, 10 kualifikasi (5 matches). Top 3 byes await first 3 winners. Last 2 winners play each other.
*   **14 Peserta (Target: 8 Besar):** 2 byes, 12 kualifikasi (6 matches). Top 2 byes await first 2 winners. Other 4 winners play each other.
*   **15 Peserta (Target: 8 Besar):** 1 bye, 14 kualifikasi (7 matches). The bye participant awaits the first winner. Other 6 winners play each other.
*   **17 Peserta (Target: 16 Besar):** 15 byes, 2 kualifikasi (1 match). The winner plays the top-seeded bye participant. The other 14 bye participants play each other.
*   **18 Peserta (Target: 16 Besar):** 14 byes, 4 kualifikasi (2 matches). Top 2 byes await winners. Other 12 byes play each other.
*   **19 Peserta (Target: 16 Besar):** 13 byes, 6 kualifikasi (3 matches). Top 3 byes await winners. Other 10 byes play each other.
*   **20 Peserta (Target: 16 Besar):** 12 byes, 8 kualifikasi (4 matches). Top 4 byes await winners. Other 8 byes play each other.
*   **21 Peserta (Target: 16 Besar):** 11 byes, 10 kualifikasi (5 matches). Top 5 byes await winners. Other 6 byes play each other.
*   **22 Peserta (Target: 16 Besar):** 10 byes, 12 kualifikasi (6 matches). Top 6 byes await winners. Other 4 byes play each other.
*   **23 Peserta (Target: 16 Besar):** 9 byes, 14 kualifikasi (7 matches). Top 7 byes await winners. Other 2 byes play each other.
*   **24 Peserta (Target: 16 Besar):** 8 byes, 16 kualifikasi (8 matches). The 8 byes await the 8 winners.
*   **25 Peserta (Target: 16 Besar):** 7 byes, 18 kualifikasi (9 matches). Top 7 byes await first 7 winners. Last 2 winners play each other.
*   **26 Peserta (Target: 16 Besar):** 6 byes, 20 kualifikasi (10 matches). Top 6 byes await first 6 winners. Last 4 winners play each other.
*   **27 Peserta (Target: 16 Besar):** 5 byes, 22 kualifikasi (11 matches). Top 5 byes await first 5 winners. Last 6 winners play each other.
*   **28 Peserta (Target: 16 Besar):** 4 byes, 24 kualifikasi (12 matches). Top 4 byes await first 4 winners. Last 8 winners play each other.
*   **29 Peserta (Target: 16 Besar):** 3 byes, 26 kualifikasi (13 matches). Top 3 byes await first 3 winners. Last 10 winners play each other.
*   **30 Peserta (Target: 16 Besar):** 2 byes, 28 kualifikasi (14 matches). Top 2 byes await first 2 winners. Last 12 winners play each other.
*   **31 Peserta (Target: 16 Besar):** 1 bye, 30 kualifikasi (15 matches). The bye participant awaits the first winner. Last 14 winners play each other.

**JSON Output:**
You MUST return the output ONLY in the specified JSON format. Do not add any extra explanations or text.

Here is the input data:
- 'participantCount': {{participantCount}}
- 'participantList': {{#each participantList}}"{{this}}"{{#unless @last}}, {{/unless}}{{/each}}
`,
});

const generateBracketFlow = ai.defineFlow(
  {
    name: 'generateBracketFlow',
    inputSchema: BracketGeneratorInputSchema,
    outputSchema: BracketGeneratorOutputSchema,
  },
  async (input) => {
    const {output} = await bracketGeneratorPrompt(input);
    return output!;
  }
);
