
"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface DistributeSchedulesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDistribute: (gelanggangList: string[]) => Promise<void>;
}

export function DistributeSchedulesDialog({ isOpen, onClose, onDistribute }: DistributeSchedulesDialogProps) {
  const [gelanggangs, setGelanggangs] = useState('Gelanggang 1, Gelanggang 2');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async () => {
    const gelanggangList = gelanggangs.split(',').map(g => g.trim()).filter(Boolean);
    if (gelanggangList.length === 0) {
      alert("Masukkan setidaknya satu nama gelanggang.");
      return;
    }
    setIsProcessing(true);
    await onDistribute(gelanggangList);
    setIsProcessing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isProcessing && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Distribusikan Jadwal ke Gelanggang</DialogTitle>
          <DialogDescription>
            Masukkan nama semua gelanggang yang tersedia, dipisahkan dengan koma. Jadwal akan didistribusikan secara merata ke gelanggang-gelanggang ini.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="gelanggang-distribute">Nama Gelanggang</Label>
          <Input
            id="gelanggang-distribute"
            value={gelanggangs}
            onChange={(e) => setGelanggangs(e.target.value)}
            placeholder="cth: Gelanggang 1, Gelanggang 2, Gelanggang 3"
            disabled={isProcessing}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Distribusikan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
