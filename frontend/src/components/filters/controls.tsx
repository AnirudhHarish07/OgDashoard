import { useEffect, useMemo, useRef, useState } from 'react';

export function Select({ label, value, onChange, options, allLabel }: {
  label: string; value: string | null; onChange: (v: string | null) => void; options: { value: string; label: string }[]; allLabel: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <select className="field min-w-[8.5rem]" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label={label}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Segmented<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex self-start overflow-hidden rounded-lg border border-line bg-raised">
        {options.map((o) => (
          <button
            key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-sm transition-colors duration-hover ${value === o.value ? 'bg-teal/20 font-medium text-ink' : 'text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Two-handle year range slider; commits are debounced by the caller. */
export function RangeSlider({ min, max, from, to, onChange }: { min: number; max: number; from: number; to: number; onChange: (from: number, to: number) => void }) {
  const [lo, setLo] = useState(from);
  const [hi, setHi] = useState(to);
  useEffect(() => { setLo(from); setHi(to); }, [from, to]);
  useEffect(() => {
    if (lo === from && hi === to) return;
    const t = setTimeout(() => onChange(lo, hi), 180);
    return () => clearTimeout(t);
  }, [lo, hi, from, to, onChange]);
  const span = Math.max(1, max - min);
  return (
    <div className="flex flex-col gap-1" style={{ width: 210 }}>
      <span className="label flex justify-between"><span>Years</span><span className="num normal-case tracking-normal text-ink">{lo} to {hi}</span></span>
      <div className="relative h-8">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-line" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-teal" style={{ left: `${((lo - min) / span) * 100}%`, right: `${100 - ((hi - min) / span) * 100}%` }} />
        {([['From year', lo, (v: number) => setLo(Math.min(v, hi))], ['To year', hi, (v: number) => setHi(Math.max(v, lo))]] as const).map(([name, val, set]) => (
          <input
            key={name} type="range" min={min} max={max} step={1} value={val} aria-label={name} onChange={(e) => set(Number(e.target.value))}
            className="range-thumb pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent"
          />
        ))}
      </div>
    </div>
  );
}

export function MultiSelect({ label, options, selected, onToggle, onClear, allLabel }: {
  label: string; options: { value: string; label: string; hint?: string }[]; selected: string[]; onToggle: (v: string) => void; onClear: () => void; allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const shown = useMemo(() => options.filter((o) => (o.label + (o.hint ?? '')).toLowerCase().includes(q.toLowerCase())), [options, q]);
  const summary = selected.length === 0 ? allLabel : selected.length <= 2 ? selected.join(', ') : `${selected.length} selected`;
  return (
    <div ref={root} className="relative flex flex-col gap-1">
      <span className="label">{label}</span>
      <button type="button" className="field flex min-w-[10rem] items-center justify-between gap-2 text-left" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="truncate">{summary}</span>
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-faint"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div className="card absolute left-0 top-full z-50 mt-1.5 w-72 p-2" role="listbox" aria-multiselectable="true" aria-label={label}>
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search states and UTs" className="field mb-2 w-full" aria-label="Search states" />
          <div className="max-h-64 overflow-auto pr-1">
            {shown.length === 0 && <p className="p-2 text-xs text-muted">No match.</p>}
            {shown.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value} type="button" role="option" aria-selected={on} onClick={() => onToggle(o.value)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-hover hover:bg-line/40 ${on ? 'text-ink' : 'text-muted'}`}
                >
                  <span aria-hidden className={`grid h-4 w-4 place-items-center rounded border ${on ? 'border-teal bg-teal text-bg' : 'border-line'}`}>{on && <svg width="10" height="10" viewBox="0 0 10 10"><path d="m2 5 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>}</span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-[10px] text-faint">{o.hint}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <button type="button" className="text-xs text-muted hover:text-ink" onClick={onClear}>Clear</button>
            <button type="button" className="text-xs text-teal hover:underline" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
