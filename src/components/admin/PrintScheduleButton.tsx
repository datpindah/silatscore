"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface PrintScheduleButtonProps {
  scheduleType: 'Tanding' | 'TGR';
  disabled?: boolean;
}

export function PrintScheduleButton({ scheduleType, disabled }: PrintScheduleButtonProps) {
  const handlePrint = () => {
    // In a real app, you might want to format a specific part of the page for printing
    // or open a new window with a print-friendly layout.
    // For now, this will print the current window.
    window.print();
  };

  return (
    <Button onClick={handlePrint} disabled={disabled} className="bg-accent hover:bg-accent/90 text-accent-foreground">
      <Printer className="mr-2 h-4 w-4" />
      Cetak Jadwal {scheduleType}
    </Button>
  );
}
