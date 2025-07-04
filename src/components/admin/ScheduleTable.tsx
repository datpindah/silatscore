
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { ScheduleTanding, ScheduleTGR } from "@/lib/types";
import type { ReactNode } from "react";

type ScheduleItem = ScheduleTanding | ScheduleTGR;

interface ScheduleTableProps<T extends ScheduleItem> {
  schedules: T[];
  caption: string;
  headers: string[];
  renderRow: (schedule: T, index: number) => React.ReactNode;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  renderCustomActions?: (schedule: T) => ReactNode;
}

export function ScheduleTable<T extends ScheduleItem>({
  schedules,
  caption,
  headers,
  renderRow,
  onEdit,
  onDelete,
  renderCustomActions,
}: ScheduleTableProps<T>) {
  const hasActions = onEdit || onDelete || renderCustomActions;
  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>{header}</TableHead>
          ))}
          {hasActions && <TableHead>Aksi</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {schedules.length === 0 ? (
          <TableRow>
            <TableCell colSpan={headers.length + (hasActions ? 1 : 0)} className="text-center">
              Tidak ada jadwal.
            </TableCell>
          </TableRow>
        ) : (
          schedules.map((schedule, index) => (
            <TableRow key={schedule.id}>
              {renderRow(schedule, index)}
              {hasActions && (
                <TableCell>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {renderCustomActions && renderCustomActions(schedule)}
                    {onEdit && (
                      <Button variant="outline" size="sm" onClick={() => onEdit(schedule.id)}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                    )}
                    {onDelete && (
                      <Button variant="destructive" size="sm" onClick={() => onDelete(schedule.id)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Hapus
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

    