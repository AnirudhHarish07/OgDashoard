import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 pb-1">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** A small caption under a chart that states what the numbers are and where they come from. */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="px-1 pt-1 text-[11px] text-faint">{children}</p>;
}
