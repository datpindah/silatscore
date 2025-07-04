import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function SchemeListPage() {
  return (
    <>
      <PageTitle title="Daftar Bagan" description="Fitur untuk menyimpan dan melihat daftar bagan sedang dalam pengembangan." />
      <Button asChild variant="outline">
        <Link href="/admin">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali ke Dashboard Admin
        </Link>
      </Button>
    </>
  );
}
