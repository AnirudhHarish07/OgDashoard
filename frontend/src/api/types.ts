import type { components } from './schema';

type S = components['schemas'];
export type AskResponse = S['Envelope_AskData_'];
export type Meta = S['Meta'];
export type MapResponse = S['Envelope_MapData_'];
export type MapState = S['MapState'];
export type GeoCollection = S['GeoCollection'];
export type GeoFeature = S['GeoFeature'];
export type KpiResponse = S['Envelope_KpiData_'];
export type Kpi = S['Kpi'];
export type TrendResponse = S['Envelope_TrendData_'];
export type InsightResponse = S['Envelope_InsightData_'];
export type InsightCard = S['InsightCard'];
export type FiltersResponse = S['Envelope_FiltersData_'];
export type StateDetailResponse = S['Envelope_StateDetail_'];
