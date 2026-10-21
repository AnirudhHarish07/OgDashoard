/** MapLibre v6 starts a module worker from a URL it derives itself, which breaks under Vite's dep optimisation.
 *  Bundle the worker with Vite and point MapLibre at it (works in dev and in the production build). */
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
