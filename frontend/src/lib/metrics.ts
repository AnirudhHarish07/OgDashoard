/** Metrics the ranking and map endpoints accept (names come from the API contract). */
export const RANK_METRICS = [
  { value: 'total_visits', label: 'Total visits' },
  { value: 'domestic_visits', label: 'Domestic visits' },
  { value: 'foreign_visits', label: 'Foreign visits' },
  { value: 'revenue', label: 'Tourism revenue' },
  { value: 'growth_pct', label: 'YoY growth' },
  { value: 'visits_per_1000_people', label: 'Visits per 1,000 people' },
] as const;
