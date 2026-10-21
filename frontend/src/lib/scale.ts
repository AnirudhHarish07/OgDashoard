/** Round a log-axis bound down / up to a power of ten so ticks land on readable values (1 L, 10 L, 1 Cr ...). */
export const niceLogMin = (v: number) => 10 ** Math.floor(Math.log10(Math.max(v, 1)));
export const niceLogMax = (v: number) => 10 ** Math.ceil(Math.log10(Math.max(v, 1)));
export const floorTo = (v: number, step: number) => Math.floor(v / step) * step;
export const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;
