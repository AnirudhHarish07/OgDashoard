import type { ReactNode } from 'react';
import { ApiError } from '@/api/client';

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={`skeleton ${className}`} style={style} />;
}

export function EmptyState({ title = 'Nothing to show', hint = 'No data matches the current filters.', action }: { title?: string; hint?: string; action?: ReactNode }) {
  return (
    <div role="status" className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
      <svg aria-hidden width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-faint">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8 11h6" />
      </svg>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-xs text-xs text-muted">{hint}</p>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div role="alert" className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 p-6 text-center">
      <svg aria-hidden width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-bad">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" />
      </svg>
      <p className="text-sm font-medium text-ink">Couldn't load this data</p>
      <p className="max-w-sm text-xs text-muted">{msg}</p>
      {onRetry && <button type="button" className="btn mt-1" onClick={onRetry}>Retry</button>}
    </div>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** One place for the loading / error / empty states every data component needs. */
export function QueryBoundary<T>({ query, skeleton, isEmpty, emptyHint, children }: {
  query: QueryLike<T>;
  skeleton?: ReactNode;
  isEmpty?: (data: T) => boolean;
  emptyHint?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isLoading || !query.data) return <>{skeleton ?? <Skeleton className="h-full min-h-[120px] w-full" />}</>;
  if (isEmpty?.(query.data)) return <EmptyState hint={emptyHint} />;
  return <>{children(query.data)}</>;
}
