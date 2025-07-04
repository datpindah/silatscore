import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function SchemeDetailPage() {
  return (
    <>
      <PageTitle title="Detail Bagan" description="Fitur untuk menampilkan detail bagan pertandingan sedang dalam pengembangan." />
      <Button asChild variant="outline">
        <Link href="/admin/scheme-management">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali ke Generator Bagan
        </Link>
      </Button>
    </>
  );
}
