import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function RemovedFeaturePage() {
  return (
    <>
      <PageTitle title="Fitur Dihapus" description="Fitur pembuatan bagan pertandingan telah dihapus dari aplikasi." />
      <Button asChild variant="outline">
        <Link href="/admin">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali ke Dashboard Admin
        </Link>
      </Button>
    </>
  );
}
