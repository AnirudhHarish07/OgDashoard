import { Recovery } from '@/components/covid/Recovery';
import { PageHeader } from '@/components/common/PageHeader';

export default function Covid() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-5">
      <PageHeader title="COVID impact and recovery" subtitle="How far visits fell during the COVID years and how quickly each state has come back, for domestic and foreign visitors." />
      <Recovery />
    </div>
  );
}
