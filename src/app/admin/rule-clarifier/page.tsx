"use client";

import { useState, type FormEvent } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Lightbulb } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { clarifyRule, type ClarifyRuleInput, type ClarifyRuleOutput } from '@/ai/flows/rule-clarifier'; // Ensure correct path

export default function RuleClarifierPage() {
  const [pelanggaranDescription, setPelanggaranDescription] = useState('');
  const [clarification, setClarification] = useState<ClarifyRuleOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pelanggaranDescription.trim()) {
      setError('Deskripsi pelanggaran tidak boleh kosong.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setClarification(null);

    try {
      const input: ClarifyRuleInput = { pelanggaranDescription };
      const result = await clarifyRule(input);
      setClarification(result);
    } catch (err) {
      console.error("Error clarifying rule:", err);
      setError(err instanceof Error ? err.message : 'Gagal mendapatkan klarifikasi aturan.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <PageTitle title="Klarifikasi Aturan Pencak Silat" description="Dapatkan penjelasan aturan berdasarkan deskripsi pelanggaran." />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="font-headline">Input Deskripsi Pelanggaran</CardTitle>
          <CardDescription>
            Masukkan deskripsi detail mengenai pelanggaran yang terjadi untuk mendapatkan klarifikasi aturan yang relevan.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid w-full gap-1.5">
              <Label htmlFor="pelanggaranDescription" className="font-headline">Deskripsi Pelanggaran</Label>
              <Textarea
                id="pelanggaranDescription"
                placeholder="Contoh: Pesilat Merah menyerang area terlarang (wajah) saat lawan terjatuh..."
                value={pelanggaranDescription}
                onChange={(e) => setPelanggaranDescription(e.target.value)}
                rows={5}
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardContent> {/* Changed from CardFooter to CardContent for button alignment */}
            <Button type="submit" disabled={isLoading} className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Dapatkan Klarifikasi
                </>
              )}
            </Button>
          </CardContent>
        </form>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle className="font-headline">Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {clarification && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-primary">Hasil Klarifikasi Aturan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold font-headline mb-1">Aturan yang Relevan:</h3>
              <p className="font-body bg-muted p-3 rounded-md">{clarification.relevantRule}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold font-headline mb-1">Penjelasan Aturan:</h3>
              <p className="font-body whitespace-pre-line leading-relaxed bg-muted p-3 rounded-md">{clarification.ruleExplanation}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
