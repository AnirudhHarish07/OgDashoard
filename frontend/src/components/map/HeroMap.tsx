import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './maplibre-setup';
import { Map as MapGL } from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, GeoJSONSourceSpecification, Map as MlMap, MapMouseEvent, MapOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { toPng } from 'html-to-image';
import { useGeo, useMapData, useResolved } from '@/api/hooks';
import type { GeoCollection, MapState } from '@/api/types';
import { ExportMenu } from '@/components/charts/ExportMenu';
import { DataTable } from '@/components/charts/DataTable';
import { Segmented } from '@/components/filters/controls';
import { ErrorState, Skeleton } from '@/components/common/States';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { useFilters } from '@/store/filters';
import { useUi } from '@/store/ui';
import { mix, NEUTRAL, NO_DATA, rgbToHex } from '@/lib/colour';
import { formatMetric } from '@/lib/format';
import { MOTION, ease, lerp, subscribePointer, useMotionEnabled, usePointerFx } from '@/ui/interactions';
import { FollowTooltip } from './FollowTooltip';
import { LabelLayer, type LabelRow } from './LabelLayer';
import { MapLegend } from './MapLegend';
import { nextState, type Dir } from './nav';
import { buildLegend, computeVis, type ColourMode } from './scales';
import { StatePanel } from './StatePanel';
import { StateTweener } from './StateTweener';

const METRICS = [
  { value: 'total_visits', label: 'Visits' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'growth_pct', label: 'Growth' },
  { value: 'visits_per_1000_people', label: 'Per 1,000' },
] as const;
type Metric = (typeof METRICS)[number]['value'];
type Phase = 'home' | 'in' | 'detail' | 'out';

const EXTRUDE_MAX = 380000;
const PANEL = 470;
const HOME_PAD = { top: 16, bottom: 64, left: 24, right: 24 };
const colourExpr = (fallback: string) => ['to-color', ['coalesce', ['feature-state', 'fill'], fallback]] as ExpressionSpecification;
const fs = (k: string, d: number) => ['coalesce', ['feature-state', k], d] as ExpressionSpecification;

interface Feat { code: string; name: string; lon: number; lat: number; small: boolean; bbox: [number, number, number, number] }

function toFeats(geo: GeoCollection): Feat[] {
  return geo.features.map((f) => ({
    code: f.properties.state_code, name: f.properties.state_name, lon: f.properties.centroid[0], lat: f.properties.centroid[1],
    small: f.properties.small_state, bbox: f.properties.bbox as [number, number, number, number],
  }));
}
function union(fs_: Feat[]): [[number, number], [number, number]] {
  return [[Math.min(...fs_.map((f) => f.bbox[0])), Math.min(...fs_.map((f) => f.bbox[1]))], [Math.max(...fs_.map((f) => f.bbox[2])), Math.max(...fs_.map((f) => f.bbox[3]))]];
}

export default function HeroMap() {
  const geo = useGeo();
  const [metric, setMetric] = useState<Metric>('total_visits');
  const [mode, setMode] = useState<ColourMode>('choropleth');
  const [extrude, setExtrude] = useState(false);
  const [phase, setPhase] = useState<Phase>('home');
  const [ready, setReady] = useState(false);
  const [over, setOver] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const theme = useUi((s) => s.theme);
  const hovered = useUi((s) => s.hovered);
  const setHovered = useUi((s) => s.setHovered);
  const selected = useUi((s) => s.crossFilter);
  const setSelected = useUi((s) => s.setCrossFilter);
  const motion = useMotionEnabled();
  const pointerFx = usePointerFx();
  const mapQ = useMapData(metric);
  const { bounds, year } = useResolved();
  const setYear = useFilters((s) => s.setYear);

  const card = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const tween = useRef<StateTweener | null>(null);
  const labels = useRef<LabelLayer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHover = useRef<string | null>(null);
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const extrudeRef = useRef(extrude);
  extrudeRef.current = extrude;

  const feats = useMemo(() => (geo.data ? toFeats(geo.data) : []), [geo.data]);
  const byCode = useMemo(() => new Map(feats.map((f) => [f.code, f])), [feats]);
  const home = useMemo(() => (feats.length ? union(feats) : null), [feats]);
  const rows = useMemo<MapState[]>(() => mapQ.data?.data.states ?? [], [mapQ.data]);
  const rowByCode = useMemo(() => new Map(rows.map((r) => [r.state_code, r])), [rows]);
  const source = mapQ.data?.meta.data_sources[0];
  const dimOthers = selected != null && phase !== 'home';

  // ---- create the map once the geometry is loaded -------------------------------------------
  useEffect(() => {
    if (!geo.data || !host.current || !labelHost.current || !home) return;
    const fc = { type: 'FeatureCollection', features: geo.data.features } as unknown as GeoJSONSourceSpecification['data'];
    const map = new MapGL({
      container: host.current, style: { version: 8, sources: {}, layers: [] }, bounds: home,
      fitBoundsOptions: { padding: HOME_PAD }, attributionControl: false, renderWorldCopies: false,
      maxPitch: 62, pitchWithRotate: false, canvasContextAttributes: { preserveDrawingBuffer: true },
    } as MapOptions);
    map.dragPan.disable(); map.scrollZoom.disable(); map.dragRotate.disable(); map.doubleClickZoom.disable();
    map.touchZoomRotate.disable(); map.keyboard.disable(); map.boxZoom.disable();
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map?: MlMap }).__map = map;
    map.on('error', (e) => console.error('maplibre error:', e.error?.message ?? e));
    map.on('load', () => {
      map.addSource('states', { type: 'geojson', data: fc, promoteId: 'state_code' });
      const dark = useUi.getState().theme === 'dark';
      map.addLayer({ id: 'states-fill', type: 'fill', source: 'states', paint: { 'fill-color': colourExpr(NEUTRAL.dark), 'fill-opacity': fs('op', 1) } });
      map.addSource('lift', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'states-lift', type: 'fill-extrusion', source: 'lift', paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': 80000, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 } });
      map.addLayer({ id: 'states-extrude', type: 'fill-extrusion', source: 'states', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': colourExpr(NEUTRAL.dark), 'fill-extrusion-height': ['*', fs('h', 0), EXTRUDE_MAX], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.94 } });
      map.addLayer({ id: 'states-glow', type: 'line', source: 'states', paint: { 'line-color': dark ? '#ffb15c' : '#c25a05', 'line-width': 9, 'line-blur': 7, 'line-opacity': ['*', 0.9, fs('hv', 0)] } });
      map.addLayer({ id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': dark ? '#0b101d' : '#ffffff', 'line-width': ['+', 0.6, ['*', 1.8, fs('hv', 0)]], 'line-opacity': fs('op', 1) }, layout: { 'line-join': 'round' } });
      tween.current = new StateTweener(map, 'states', motionRef.current);
      labels.current = new LabelLayer(map, labelHost.current as HTMLElement, feats, {
        onHover: (c) => useUi.getState().setHovered(c),
        onPick: (c) => window.dispatchEvent(new CustomEvent('map:pick', { detail: c })),
      });
      map.resize();
      map.fitBounds(home, { padding: HOME_PAD, duration: 0 });
      setReady(true);
    });
    const codeAt = (e: MapMouseEvent): string | null => {
      const layers = [extrudeRef.current ? 'states-extrude' : 'states-fill'].filter((l) => map.getLayer(l));
      const f = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
      return (f[0]?.properties?.state_code as string | undefined) ?? null;
    };
    map.on('mousemove', (e) => {
      const c = codeAt(e);
      useUi.getState().setHovered(c);
      if (host.current) host.current.dataset.cursor = c ? 'hover' : '';
    });
    map.on('mouseout', () => useUi.getState().setHovered(null));
    map.on('click', (e) => {
      const c = codeAt(e);
      if (c) window.dispatchEvent(new CustomEvent('map:pick', { detail: c }));
    });
    const ro = new ResizeObserver(() => {
      map.resize();
      if (phaseRef.current === 'home' && !extrudeRef.current && map.loaded()) map.fitBounds(home, { padding: HOME_PAD, duration: 0, pitch: map.getPitch(), bearing: map.getBearing() });
    });
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      labels.current?.destroy(); labels.current = null;
      tween.current?.destroy(); tween.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.data, home]);

  // ---- colours, heights and labels from the API rows ------------------------------------------
  const legend = useMemo(() => buildLegend(rows, { metric, mode, theme }), [rows, metric, mode, theme]);
  useEffect(() => {
    const t = tween.current;
    if (!ready || !t) return;
    t.animate = motion;
    const vis = computeVis(rows, feats.map((f) => f.code), { metric, mode, theme });
    for (const f of feats) {
      const v = vis.get(f.code);
      const hasRow = rowByCode.has(f.code);
      t.set(f.code, {
        fill: v?.fill, h: v?.h ?? 0,
        op: dimOthers && f.code !== selected ? 0.12 : hasRow ? 1 : 0.5,
        hv: f.code === selected && phase !== 'home' ? 1 : f.code === hovered ? 1 : 0,
      });
    }
    t.commit();
    const lab = new Map<string, LabelRow>();
    for (const r of rows) lab.set(r.state_code, { display: r.display, rank: r.rank ?? null, isTop10: r.is_top10 });
    labels.current?.setData(lab, mode === 'top10');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rows, feats, metric, mode, theme, motion, dimOthers, selected, phase]);

  // ---- hover (shared store) -> feature-state lift + label ---------------------------------------
  useEffect(() => {
    const t = tween.current;
    if (!ready || !t) return;
    const prev = prevHover.current;
    if (prev && prev !== hovered && !(prev === selected && phase !== 'home')) t.set(prev, { hv: 0 });
    if (hovered) t.set(hovered, { hv: 1 });
    prevHover.current = hovered;
    t.commit();
    labels.current?.setActive(hovered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, ready]);

  // ---- hover lift: only the hovered / selected polygon is raised, in a lightened colour --------------
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource('lift') as GeoJSONSource | undefined;
    if (!ready || !geo.data || !src) return;
    const codes = new Set<string>();
    if (hovered) codes.add(hovered);
    if (selected && phase !== 'home') codes.add(selected);
    const features = geo.data.features.filter((f) => codes.has(f.properties.state_code)).map((f) => {
      const t = tween.current?.get(f.properties.state_code);
      const c = t ? rgbToHex(mix([t.r, t.g, t.b], [255, 255, 255], 0.16)) : '#ffffff';
      return { ...f, properties: { ...f.properties, c } };
    });
    src.setData({ type: 'FeatureCollection', features } as unknown as GeoJSONSourceSpecification['data']);
  }, [hovered, selected, phase, ready, geo.data, rows, mode, extrude]);

  useEffect(() => {
    labels.current?.setSelected(phase === 'home' ? null : selected, dimOthers);
  }, [selected, phase, dimOthers, ready]);

  // ---- theme: outline colours -------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setPaintProperty('states-line', 'line-color', theme === 'dark' ? '#0b101d' : '#ffffff');
    map.setPaintProperty('states-glow', 'line-color', theme === 'dark' ? '#ffb15c' : '#c25a05');
    const fb = (theme === 'dark' ? NEUTRAL.dark : NEUTRAL.light) || NO_DATA.dark;
    map.setPaintProperty('states-fill', 'fill-color', colourExpr(fb));
    map.setPaintProperty('states-extrude', 'fill-extrusion-color', colourExpr(fb));
  }, [theme, ready]);

  // ---- 3D mode ------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty('states-extrude', 'visibility', extrude ? 'visible' : 'none');
    map.setLayoutProperty('states-fill', 'visibility', extrude ? 'none' : 'visible');
    map.setLayoutProperty('states-lift', 'visibility', extrude ? 'none' : 'visible');
    if (phaseRef.current === 'home' && home) map.fitBounds(home, { padding: extrude ? { ...HOME_PAD, top: 70 } : HOME_PAD, pitch: extrude ? 48 : 0, bearing: extrude ? -8 : 0, duration: motionRef.current ? 800 : 0, easing: ease });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrude, ready]);

  // ---- selection: fly-in and back -------------------------------------------------------------------
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const select = useCallback((code: string) => {
    const map = mapRef.current;
    const f = byCode.get(code);
    if (!map || !f) return;
    clearTimer();
    setSelected(code);
    setHovered(code);
    setPhase('in');
    const dur = motionRef.current ? MOTION.fly : 0;
    map.stop();
    map.fitBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]], {
      padding: { top: 80, bottom: 80, left: 60, right: PANEL + 40 }, pitch: 50, bearing: -6, maxZoom: 7.2, duration: dur, easing: ease,
    });
    timer.current = setTimeout(() => setPhase('detail'), dur + 60);
  }, [byCode, setSelected, setHovered]);

  const back = useCallback(() => {
    const map = mapRef.current;
    if (!map || !home) return;
    clearTimer();
    setPhase('out');
    setSelected(null);
    const dur = motionRef.current ? MOTION.fly : 0;
    map.stop();
    map.fitBounds(home, { padding: HOME_PAD, pitch: extrudeRef.current ? 48 : 0, bearing: extrudeRef.current ? -8 : 0, duration: dur, easing: ease });
    timer.current = setTimeout(() => setPhase('home'), dur + 60);
  }, [home, setSelected]);

  useEffect(() => {
    const onPick = (e: Event) => select((e as CustomEvent<string>).detail);
    window.addEventListener('map:pick', onPick);
    return () => { window.removeEventListener('map:pick', onPick); clearTimer(); };
  }, [select]);

  // selection coming from outside (URL ?x=, chip removal): keep the map in step
  useEffect(() => {
    if (!ready) return;
    if (selected && phase === 'home') select(selected);
    if (!selected && (phase === 'in' || phase === 'detail')) back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

  // ---- parallax tilt (all-India view only) ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || phase !== 'home' || !pointerFx || extrude) return;
    const cur = { p: map.getPitch(), b: map.getBearing() };
    const tgt = { p: 0, b: 0 };
    let raf = 0;
    const loop = () => {
      cur.p = lerp(cur.p, tgt.p, 0.08);
      cur.b = lerp(cur.b, tgt.b, 0.08);
      map.jumpTo({ pitch: cur.p, bearing: cur.b });
      raf = Math.abs(cur.p - tgt.p) > 0.02 || Math.abs(cur.b - tgt.b) > 0.02 ? requestAnimationFrame(loop) : 0;
    };
    const unsub = subscribePointer((p) => {
      const r = host.current?.getBoundingClientRect();
      if (!r) return;
      const inside = p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
      tgt.b = inside ? ((p.x - r.left) / r.width * 2 - 1) * 4 : 0;
      tgt.p = inside ? (1 - (p.y - r.top) / r.height) * 4 : 0;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    return () => { if (raf) cancelAnimationFrame(raf); unsub(); };
  }, [ready, phase, pointerFx, extrude]);

  // ---- keyboard: arrows move between states (same highlight as hover), Enter opens, Esc goes back ----
  const onKey = (e: React.KeyboardEvent) => {
    const dirs: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (dirs[e.key]) {
      e.preventDefault();
      const pool = phase === 'home' ? feats : feats.filter((f) => rowByCode.has(f.code));
      const n = nextState(hovered, dirs[e.key], pool.map((f) => ({ code: f.code, lon: f.lon, lat: f.lat })));
      if (n) setHovered(n);
    } else if ((e.key === 'Enter' || e.key === ' ') && hovered) {
      e.preventDefault();
      select(hovered);
    } else if (e.key === 'Escape' && phase !== 'home') back();
  };

  const row = hovered ? rowByCode.get(hovered) : undefined;
  const title = METRICS.find((m) => m.value === metric)?.label ?? '';
  const announce = hovered ? `${byCode.get(hovered)?.name ?? hovered}${row?.display ? `, ${row.display}` : ''}${row?.rank ? `, rank ${row.rank}` : ''}` : '';
  const tableRows = [...rows].filter((r) => r.value != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const mapMeta = mapQ.data?.data;

  // year slider (debounced)
  const [yr, setYr] = useState<number | null>(null);
  useEffect(() => setYr(year), [year]);
  useEffect(() => {
    if (yr == null || yr === year) return;
    const t = setTimeout(() => setYear(yr), 140);
    return () => clearTimeout(t);
  }, [yr, year, setYear]);

  const downloadPng = async () => {
    if (!card.current) return;
    const a = document.createElement('a');
    a.href = await toPng(card.current, { pixelRatio: 2, cacheBust: true });
    a.download = `india-map-${metric}-${year ?? ''}.png`;
    a.click();
  };

  return (
    <section ref={card} aria-label="Interactive map of India" className="card relative overflow-hidden">
      <header className="relative z-30 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="mr-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">India by state <SyntheticBadge compact /></h2>
          <p className="text-xs text-muted">{mapMeta ? `${mapMeta.label} · ${mapMeta.year}` : 'Loading'}</p>
        </div>
        <div className="whitespace-nowrap"><Segmented label="" value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} /></div>
        <div className="whitespace-nowrap"><Segmented label="" value={mode} onChange={setMode} options={[{ value: 'choropleth', label: 'Choropleth' }, { value: 'top10', label: 'Top 10' }]} /></div>
        <button type="button" className="btn text-xs" aria-pressed={extrude} onClick={() => setExtrude((v) => !v)}>3D</button>
        <div className="ml-auto flex items-center gap-2">
          {mapQ.isFetching && <span className="text-[11px] text-faint" role="status">Updating</span>}
          <button type="button" className="btn !py-1 text-xs" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>{asTable ? 'Map' : 'Table'}</button>
          <ExportMenu view="map" params={{ ...mapQ.params }} onPng={downloadPng} />
        </div>
      </header>

      <div className="relative h-[clamp(520px,72vh,780px)]">
        {/* MapLibre's CSS forces position:relative on its container, so it needs a sized wrapper rather than inset-0 on itself */}
        <div className="absolute inset-0">
          <div
            ref={host} tabIndex={0} role="application" aria-roledescription="map"
            aria-label="Interactive map of India by state. Use the arrow keys to move between states, Enter to open a state, Escape to go back."
            className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-teal/70"
            onKeyDown={onKey} onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)}
          />
        </div>
        <div ref={labelHost} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
        <p className="sr-only" aria-live="polite">{announce}</p>

        {(geo.isLoading || (!ready && !geo.isError)) && <Skeleton className="absolute inset-3" />}
        {geo.isError && <div className="absolute inset-0 grid place-items-center"><ErrorState error={geo.error} onRetry={() => void geo.refetch()} /></div>}
        {mapQ.isError && !mapQ.data && <div className="absolute inset-x-0 top-0 z-10 p-3"><ErrorState error={mapQ.error} onRetry={() => void mapQ.refetch()} /></div>}
        {ready && mapQ.data && rows.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center"><span className="chip" role="status">No states match the current filters</span></div>
        )}

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-2">
          {mapMeta && <MapLegend legend={legend} title={mapMeta.label} unit={mapMeta.unit} />}
          {bounds && yr != null && (
            <div className="card pointer-events-auto flex items-center gap-3 px-3 py-2">
              <label htmlFor="map-year" className="label">Year</label>
              <input id="map-year" type="range" min={bounds.first} max={bounds.last} step={1} value={yr} onChange={(e) => setYr(Number(e.target.value))} className="range-thumb h-6 w-52 appearance-none bg-transparent" style={{ pointerEvents: 'auto', backgroundImage: 'linear-gradient(rgb(var(--line)), rgb(var(--line)))', backgroundSize: '100% 3px', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
              <output htmlFor="map-year" className="num w-10 text-right text-sm font-semibold">{yr}</output>
            </div>
          )}
        </div>
        <p className="pointer-events-none absolute bottom-3 right-3 z-10 hidden text-[10px] text-faint xl:block" style={{ right: phase === 'detail' ? PANEL + 20 : 12 }}>
          Boundaries: public Census-2011 district map, dissolved to states. Not the official Survey of India file.
        </p>

        <FollowTooltip row={row} name={hovered ? byCode.get(hovered)?.name ?? hovered : ''} metricLabel={mapMeta?.label ?? ''} source={source} visible={!!hovered && over && phase !== 'detail' && !asTable} host={host} />
        <StatePanel code={selected} open={phase === 'detail' || phase === 'in'} onBack={back} />

        {asTable && (
          <div className="absolute inset-0 z-20 overflow-auto bg-surface p-3">
            <DataTable
              caption={`${title} by state`} rows={tableRows} rowCode={(r) => r.state_code} maxHeight={640}
              columns={[
                { key: 'rank', label: 'Rank', render: (r) => r.rank ?? 'n/a' },
                { key: 'state', label: 'State / UT', render: (r) => r.state_name },
                { key: 'value', label: title, align: 'right', render: (r) => r.display ?? formatMetric(metric, r.value) },
                { key: 'yoy', label: 'YoY', align: 'right', render: (r) => r.yoy_display ?? 'n/a' },
                { key: 'top', label: 'Top 10', render: (r) => (r.is_top10 ? 'Yes' : '') },
              ]}
            />
          </div>
        )}
      </div>
    </section>
  );
}

