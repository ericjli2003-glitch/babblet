import { notFound } from 'next/navigation';
import { getSubmission } from '@/lib/batch-store';
import SubmissionDetail from './SubmissionDetail';
import type { Submission } from './SubmissionDetail';

export default async function Page({ params }: { params: { id: string } }) {
  const raw = await getSubmission(params.id);
  if (!raw) notFound();
  return <SubmissionDetail initialSubmission={raw as unknown as Submission} />;
}
