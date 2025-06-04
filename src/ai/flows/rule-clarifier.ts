// 'use server';
/**
 * @fileOverview Clarifies pencak silat rules based on pelanggaran descriptions.
 *
 * - clarifyRule - A function that clarifies the rule based on the pelanggaran.
 * - ClarifyRuleInput - The input type for the clarifyRule function.
 * - ClarifyRuleOutput - The return type for the clarifyRule function.
 */

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ClarifyRuleInputSchema = z.object({
  pelanggaranDescription: z
    .string()
    .describe('The description of the pelanggaran during the match.'),
});
export type ClarifyRuleInput = z.infer<typeof ClarifyRuleInputSchema>;

const ClarifyRuleOutputSchema = z.object({
  relevantRule: z.string().describe('The specific rule that was violated.'),
  ruleExplanation: z
    .string()
    .describe('A detailed explanation of the rule and its application to the pelanggaran.'),
});
export type ClarifyRuleOutput = z.infer<typeof ClarifyRuleOutputSchema>;

export async function clarifyRule(input: ClarifyRuleInput): Promise<ClarifyRuleOutput> {
  return clarifyRuleFlow(input);
}

const clarifyRulePrompt = ai.definePrompt({
  name: 'clarifyRulePrompt',
  input: {schema: ClarifyRuleInputSchema},
  output: {schema: ClarifyRuleOutputSchema},
  prompt: `You are an expert in Pencak Silat rules and regulations. A pelanggaran (foul) has occurred during a match, and the judge needs clarification on the specific rule that was violated.

Given the following description of the pelanggaran:

Description: {{{pelanggaranDescription}}}

Identify the relevant rule that applies to this pelanggaran and provide a detailed explanation of the rule, including how it applies to the specific situation.  Be specific and use terminology that someone well versed in Pencak Silat would understand.

Ensure that the \`relevantRule\` field contains the exact name or number of the rule that was violated.
The \`ruleExplanation\` field should contain a comprehensive explanation that helps the judge understand the rule and its implications for the point deduction.
`,
});

const clarifyRuleFlow = ai.defineFlow(
  {
    name: 'clarifyRuleFlow',
    inputSchema: ClarifyRuleInputSchema,
    outputSchema: ClarifyRuleOutputSchema,
  },
  async input => {
    const {output} = await clarifyRulePrompt(input);
    return output!;
  }
);
