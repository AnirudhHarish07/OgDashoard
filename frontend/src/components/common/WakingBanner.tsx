import { useUi } from '@/store/ui';

/** Shown when the first request takes > ~3 s (the hosted backend may be asleep). */
export function WakingBanner() {
  const waking = useUi((s) => s.waking);
  if (!waking) return null;
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-[60] flex items-center justify-center gap-3 border-b border-marigold/40 bg-marigold/15 px-4 py-2 text-sm text-ink backdrop-blur">
      <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-marigold border-t-transparent" />
      Waking up the server. The free hosting tier sleeps when idle, so this can take up to a minute.
    </div>
  );
}
