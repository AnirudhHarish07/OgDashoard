import { useEffect, useRef } from 'react';
import type { MapState } from '@/api/types';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { shortSource } from '@/lib/format';
import { subscribePointer } from '@/ui/interactions/pointer';
import { lerp } from '@/ui/interactions/tokens';
import { useMotionEnabled } from '@/ui/interactions/useMotion';

/** Follows the pointer with lerp lag. Shows exact value, rank, YoY, source and the synthetic badge. */
export function FollowTooltip({ row, name, metricLabel, source, visible, host }: {
  row: MapState | undefined; name: string; metricLabel: string; source: string | undefined; visible: boolean; host: React.RefObject<HTMLElement>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const motion = useMotionEnabled();
  useEffect(() => {
    const node = el.current;
    if (!node || !visible) return;
    const pos = { x: 0, y: 0, tx: 0, ty: 0, init: false };
    let raf = 0;
    const loop = () => {
      const box = host.current?.getBoundingClientRect();
      const w = node.offsetWidth, h = node.offsetHeight;
      let x = pos.x + 18, y = pos.y + 16;
      if (box) {
        if (x + w > box.right - 8) x = pos.x - w - 18;
        if (y + h > box.bottom - 8) y = pos.y - h - 16;
      }
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      pos.x = motion ? lerp(pos.x, pos.tx, 0.28) : pos.tx;
      pos.y = motion ? lerp(pos.y, pos.ty, 0.28) : pos.ty;
      raf = requestAnimationFrame(loop);
    };
    const unsub = subscribePointer((p) => {
      pos.tx = p.x; pos.ty = p.y;
      if (!pos.init) { pos.init = true; pos.x = p.x; pos.y = p.y; }
    });
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, [visible, host, motion]);

  if (!visible) return null;
  return (
    <div ref={el} role="tooltip" className="card pointer-events-none fixed left-0 top-0 z-[70] w-60 p-3" style={{ transform: 'translate3d(-999px,-999px,0)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{name}</p>
        {row?.is_synthetic && <SyntheticBadge compact />}
      </div>
      {row && row.value != null ? (
        <>
          <p className="num mt-1 text-xl font-semibold">{row.display}</p>
          <p className="text-[11px] text-muted">{metricLabel}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-faint">Rank</dt><dd className="num text-right">{row.rank != null ? `#${row.rank}` : 'n/a'}{row.is_top10 ? ' · top 10' : ''}</dd>
            <dt className="text-faint">YoY</dt><dd className="num text-right">{row.yoy_display ?? 'n/a'}</dd>
          </dl>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">{row?.note?.startsWith('not_available') ? 'Not available for this year (new state or no comparable previous year).' : 'No data under the current filters.'}</p>
      )}
      <p className="mt-2 border-t border-line pt-1.5 text-[10px] text-faint" title={source}>Source: {shortSource(source)}</p>
    </div>
  );
}
