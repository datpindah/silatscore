
"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { BracketView } from '@/components/admin/BracketView';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Scheme } from '@/lib/types';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ViewSchemePage() {
  const params = useParams();
  const schemeId = params.schemeId as string;

  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <PageTitle 
        title={scheme?.tandingClass || scheme?.tgrCategory || "Detail Bagan"}
        description={`${scheme?.type || ''} - ${scheme?.ageCategory || ''} | Gel: ${scheme?.gelanggang} | Babak: ${scheme?.round}`}
      >
        <Button asChild variant="outline">
          <Link href="/admin/scheme-list"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar Bagan</Link>
        </Button>
      </PageTitle>
      
      {scheme ? <BracketView scheme={scheme} /> : <p>Tidak ada data untuk ditampilkan.</p>}
    </>
  );
}
