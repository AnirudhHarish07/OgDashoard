import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { KpiCard } from '@/components/cards/KpiCard';
import { SyntheticBadge } from '@/components/common/SyntheticBadge';
import { EmptyState, ErrorState, QueryBoundary } from '@/components/common/States';
import { ApiError } from '@/api/client';
import type { Kpi } from '@/api/types';
import { useUi } from '@/store/ui';
import { sample } from './helpers';

const kpis = sample<{ data: { kpis: Kpi[]; previous_year: number } }>('overview_kpis').data;
const kpi = (key: string) => kpis.kpis.find((k) => k.key === key) as Kpi;

beforeEach(() => useUi.getState().setMotion(false)); // static text, no count-up timing

describe('KpiCard', () => {
  it('shows the value, change arrow, previous value and synthetic badge from the API', () => {
    render(<KpiCard kpi={kpi('total_domestic')} previousYear={kpis.previous_year} />);
    const k = kpi('total_domestic');
    expect(screen.getByLabelText(k.display as string)).toBeInTheDocument();
    expect(screen.getByText('Domestic visits')).toBeInTheDocument();
    expect(screen.getByText(k.change_display as string)).toBeInTheDocument();
    expect(screen.getByText(/up:/)).toBeInTheDocument(); // not colour-only: arrow + text
    expect(screen.getByText(new RegExp(`vs ${k.previous_display}`))).toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument(); // synthetic badge
  });
  it('shows the top state name and share', () => {
    render(<KpiCard kpi={kpi('top_state')} previousYear={kpis.previous_year} />);
    expect(screen.getByText(/Tamil Nadu/)).toBeInTheDocument();
    expect(screen.getByText(/% of India/)).toBeInTheDocument();
  });
  it('shows a clear not-available state for missing values', () => {
    const k = { ...kpi('revenue'), display: null, value: null, previous_display: null, direction: 'none', change_display: null, is_synthetic: false } as Kpi;
    render(<KpiCard kpi={k} previousYear={null} />);
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByText('no previous year')).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
  });
  it('explains a boundary-change comparison gap', () => {
    const k = { ...kpi('total_domestic'), previous_display: null, previous_value: null, direction: 'none', note: 'boundary_change: x' } as Kpi;
    render(<KpiCard kpi={k} previousYear={2018} />);
    expect(screen.getByText(/not comparable/)).toBeInTheDocument();
  });
});

describe('SyntheticBadge', () => {
  it('renders with an explanation when is_synthetic is true and nothing otherwise', () => {
    const { rerender } = render(<SyntheticBadge />);
    expect(screen.getByRole('note')).toHaveAttribute('aria-label', expect.stringMatching(/Synthetic demo data/));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/not official statistics/);
    rerender(<SyntheticBadge show={false} />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('loading / empty / error states', () => {
  const base = { isLoading: false, isError: false, error: null, refetch: () => undefined };
  it('renders a skeleton while loading, children when ready', () => {
    const { rerender, container } = render(<QueryBoundary query={{ ...base, data: undefined, isLoading: true }}>{() => <p>ready</p>}</QueryBoundary>);
    expect(container.querySelector('.skeleton')).toBeTruthy();
    rerender(<QueryBoundary query={{ ...base, data: { n: 1 } }}>{() => <p>ready</p>}</QueryBoundary>);
    expect(screen.getByText('ready')).toBeInTheDocument();
  });
  it('shows an empty state when the filters return nothing', () => {
    render(<QueryBoundary query={{ ...base, data: { n: 0 } }} isEmpty={(d) => d.n === 0} emptyHint="Nothing here">{() => <p>ready</p>}</QueryBoundary>);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing here');
  });
  it('shows an error state with a working retry button', async () => {
    let retried = 0;
    render(<QueryBoundary query={{ ...base, data: undefined, isError: true, error: new ApiError(500, 'internal_error', 'Server broke'), refetch: () => { retried++; } }}>{() => null}</QueryBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Server broke');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(retried).toBe(1);
  });
  it('exports a standalone empty state', () => {
    render(<EmptyState />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    render(<ErrorState error={new Error('x')} />);
  });
});
