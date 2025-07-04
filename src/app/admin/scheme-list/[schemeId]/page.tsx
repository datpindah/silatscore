
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { BracketView } from '@/components/admin/BracketView';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import type { Scheme, SchemeMatch } from '@/lib/types';
import { Loader2, ArrowLeft, Download, Save, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { toJpeg } from 'html-to-image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ViewSchemePage() {
  const params = useParams();
  const router = useRouter();
  const schemeId = params.schemeId as string;

  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const bracketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!schemeId) return;
    
    setIsLoading(true);
    const docRef = doc(db, 'schemes', schemeId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setScheme({ id: docSnap.id, ...docSnap.data() } as Scheme);
        setError(null);
      } else {
        setError("Bagan tidak ditemukan.");
        setScheme(null);
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching scheme:", err);
      setError("Gagal memuat bagan.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [schemeId]);
  
  const handleSetWinner = useCallback(async (matchId: string, winnerId: string | null) => {
    if (!scheme) return;

    setIsSaving(true);
    const newScheme = JSON.parse(JSON.stringify(scheme)) as Scheme;

    let matchFound = false;
    for (const round of newScheme.rounds) {
      const match = round.matches.find(m => m.id === matchId);
      if (match) {
        match.winnerId = winnerId;

        // Auto-advance BYEs immediately
        if (winnerId !== null && match.participant2 === null) {
            match.winnerId = match.participant1!.id;
        }

        // Advance the winner to the next match
        if (match.nextMatchId) {
          for (const nextRound of newScheme.rounds) {
            const nextMatch = nextRound.matches.find(m => m.id === match.nextMatchId);
            if (nextMatch) {
              const winnerParticipant = match.participant1?.id === winnerId ? match.participant1 : match.participant2;
              
              const parentMatch1 = newScheme.rounds[round.roundNumber-1].matches.find(m => m.nextMatchId === nextMatch.id && m.id !== matchId);
              const matchIndexInNextRound = nextRound.matches.indexOf(nextMatch);
              const parentIndex = round.matches.indexOf(match);
              
              if(parentIndex % 2 === 0){
                 nextMatch.participant1 = winnerParticipant;
              } else {
                 nextMatch.participant2 = winnerParticipant;
              }
              break;
            }
          }
        }
        matchFound = true;
        break;
      }
    }
    
    if (matchFound) {
      try {
        const schemeDocRef = doc(db, 'schemes', schemeId);
        await setDoc(schemeDocRef, newScheme);
        // The onSnapshot listener will update the local state
      } catch (err) {
        console.error("Failed to save winner update:", err);
        setError("Gagal menyimpan pemenang.");
      }
    }
    setIsSaving(false);
  }, [scheme, schemeId]);
  
  const handleResetBracket = async () => {
    if (!scheme) return;
    if (!confirm("Apakah Anda yakin ingin mereset semua progres di bagan ini? Semua pemenang akan dihapus.")) return;
    
    setIsSaving(true);
    try {
        const newScheme = JSON.parse(JSON.stringify(scheme)) as Scheme;
        
        for(let i = 0; i < newScheme.rounds.length; i++) {
            const round = newScheme.rounds[i];
            for(const match of round.matches) {
                // Reset winner unless it's a bye in the first round
                if (i === 0 && match.participant2 === null) {
                    match.winnerId = match.participant1!.id;
                } else {
                    match.winnerId = null;
                }
                
                // Clear participants in later rounds
                if (i > 0) {
                    match.participant1 = null;
                    match.participant2 = null;
                }
            }
        }
        
        // Re-populate the second round based on first round results (including byes)
        if (newScheme.rounds.length > 1) {
            const firstRound = newScheme.rounds[0];
            const secondRound = newScheme.rounds[1];
            
            for(let i = 0; i < secondRound.matches.length; i++){
                const parentMatch1 = firstRound.matches[i*2];
                const parentMatch2 = firstRound.matches[i*2 + 1];
                
                if(parentMatch1?.winnerId){
                    secondRound.matches[i].participant1 = parentMatch1.participant1;
                }
                if(parentMatch2?.winnerId){
                    secondRound.matches[i].participant2 = parentMatch2.participant1;
                }
            }
        }

        const schemeDocRef = doc(db, 'schemes', schemeId);
        await setDoc(schemeDocRef, newScheme);
    } catch (err) {
        console.error("Error resetting bracket:", err);
        setError("Gagal mereset bagan.");
    } finally {
        setIsSaving(false);
    }
  };


  const handleDownload = useCallback(() => {
    if (!bracketRef.current) {
      alert("Referensi bagan tidak ditemukan. Coba lagi.");
      return;
    }
    
    setIsDownloading(true);

    toJpeg(bracketRef.current, { 
        quality: 0.95, 
        backgroundColor: '#F5F5DC', // Light beige background
        cacheBust: true,
        pixelRatio: 2, // Higher resolution for better quality
        skipFonts: true,
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        const fileName = `bagan-${scheme?.tandingClass || scheme?.tgrCategory || schemeId}.jpg`.replace(/\s+/g, '_').toLowerCase();
        link.download = fileName;
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.error('Gagal mengkonversi bagan ke JPG', err);
        alert('Maaf, terjadi kesalahan saat mencoba membuat gambar bagan.');
      })
      .finally(() => {
        setIsDownloading(false);
      });
  }, [scheme, schemeId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Memuat Bagan...</p>
      </div>
    );
  }

  if (error) {
    return (
       <div className="text-center py-10">
          <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
           <Button asChild variant="outline" className="mt-4">
            <Link href="/admin/scheme-list"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar Bagan</Link>
          </Button>
       </div>
    );
  }
  
  const pageDescription = `${scheme?.type || ''} - ${scheme?.ageCategory || ''} | Gel: ${scheme?.gelanggangs?.join(', ') || 'N/A'}`;

  return (
    <>
      <PageTitle 
        title={scheme?.tandingClass || scheme?.tgrCategory || "Detail Bagan"}
        description={pageDescription}
      >
        <div className="flex gap-2 flex-wrap">
            {isSaving && <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /><span>Menyimpan...</span></div>}
            <Button onClick={handleResetBracket} disabled={isSaving} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset Bagan
            </Button>
            <Button onClick={handleDownload} disabled={isDownloading} variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground">
                {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download (.jpg)
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/scheme-list"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar Bagan</Link>
            </Button>
        </div>
      </PageTitle>
      
      <div ref={bracketRef} className="p-4 bg-background">
        <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-primary font-headline">{scheme?.tandingClass || scheme?.tgrCategory || "Detail Bagan"}</h2>
            <p className="text-md text-muted-foreground font-body">{pageDescription}</p>
        </div>
        {scheme ? <BracketView scheme={scheme} onSetWinner={handleSetWinner} /> : <p>Tidak ada data untuk ditampilkan.</p>}
      </div>
    </>
  );
}
