
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { BracketView } from '@/components/admin/BracketView';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Scheme } from '@/lib/types';
import { Loader2, ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import { toJpeg } from 'html-to-image';

export default function ViewSchemePage() {
  const params = useParams();
  const schemeId = params.schemeId as string;

  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
        skipFonts: true, // Fix for cross-origin font loading errors
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
          <p className="text-destructive font-semibold">{error}</p>
           <Button asChild variant="outline" className="mt-4">
            <Link href="/admin/scheme-list"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar Bagan</Link>
          </Button>
       </div>
    );
  }
  
  const pageDescription = `${scheme?.type || ''} - ${scheme?.ageCategory || ''} | Gel: ${scheme?.gelanggangs?.join(', ') || 'N/A'} | Babak: ${scheme?.round}`;

  return (
    <>
      <PageTitle 
        title={scheme?.tandingClass || scheme?.tgrCategory || "Detail Bagan"}
        description={pageDescription}
      >
        <div className="flex gap-2">
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
        {scheme ? <BracketView scheme={scheme} /> : <p>Tidak ada data untuk ditampilkan.</p>}
      </div>
    </>
  );
}
