import { PageHeader } from '@/components/common/PageHeader';
import { Heatmap } from '@/components/seasonality/Heatmap';
import { TypeCurves } from '@/components/seasonality/TypeCurves';

export default function Seasonality() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-5">
      <PageHeader title="Seasonality" subtitle="Which months each state and each kind of tourism peaks in, and which festivals fall near those peaks." />
      <Heatmap />
      <TypeCurves />
    </div>
  );
}
