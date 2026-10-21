import { CompareStates } from '@/components/compare/CompareStates';
import { RaceChart } from '@/components/compare/RaceChart';
import { RankingChart } from '@/components/compare/RankingChart';
import { ScatterChart } from '@/components/compare/ScatterChart';
import { PageHeader } from '@/components/common/PageHeader';

export default function Compare() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-5">
      <PageHeader title="State comparison" subtitle="Rank states, watch rankings change over time, compare 2 or 3 states side by side, and see where crowds and spending diverge." />
      <div className="grid grid-cols-2 gap-5">
        <RankingChart />
        <RaceChart />
      </div>
      <CompareStates />
      <ScatterChart />
    </div>
  );
}
