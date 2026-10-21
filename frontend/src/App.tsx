import { lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { Layout } from '@/components/common/Layout';
import { useUrlSync } from '@/store/url';

const Home = lazy(() => import('@/pages/Home'));
const Overview = lazy(() => import('@/pages/Overview'));
const Compare = lazy(() => import('@/pages/Compare'));
const StatePage = lazy(() => import('@/pages/StatePage'));
const Seasonality = lazy(() => import('@/pages/Seasonality'));
const Economy = lazy(() => import('@/pages/Economy'));
const Covid = lazy(() => import('@/pages/Covid'));

export default function App() {
  useUrlSync();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="overview" element={<Overview />} />
        <Route path="compare" element={<Compare />} />
        <Route path="state/:code" element={<StatePage />} />
        <Route path="seasonality" element={<Seasonality />} />
        <Route path="economy" element={<Economy />} />
        <Route path="covid" element={<Covid />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
