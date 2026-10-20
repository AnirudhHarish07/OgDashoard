import { DemandCapacity } from '@/components/economy/DemandCapacity';
import { EconomyBars, EconomySummary } from '@/components/economy/EconomyBars';
import { OccupancyTrend } from '@/components/economy/OccupancyTrend';
import { PageHeader } from '@/components/common/PageHeader';

export default function Economy() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-5">
      <PageHeader title="Economy and infrastructure" subtitle="How much tourism contributes to each state's economy, where visits outrun hotel capacity, and how occupancy has moved." />
      <EconomySummary />
      <EconomyBars />
      <DemandCapacity />
      <OccupancyTrend />
    </div>
  );
}
