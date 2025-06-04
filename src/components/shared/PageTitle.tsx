import type { ReactNode } from 'react';

interface PageTitleProps {
  title: string;
  description?: string | ReactNode;
  children?: ReactNode; // For actions like buttons next to the title
}

export function PageTitle({ title, description, children }: PageTitleProps) {
  return (
    <div className="mb-6 md:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-3xl font-headline font-bold tracking-tight text-primary">{title}</h1>
        {children && <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-2 sm:mt-0">{children}</div>}
      </div>
      {description && <p className="mt-2 text-md text-foreground/80 font-body">{description}</p>}
    </div>
  );
}
