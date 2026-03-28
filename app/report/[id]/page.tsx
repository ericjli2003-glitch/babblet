import { AlertTriangle } from 'lucide-react';
import { getSubmission } from '@/lib/batch-store';
import { getGradingContext } from '@/lib/context-store';
import ReportContent, { type Submission, type ContextInfo } from './ReportContent';

export default async function StudentReportPage({ params }: { params: { id: string } }) {
  const raw = await getSubmission(params.id);

  if (!raw || raw.status !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-surface-900 mb-2">Report Not Available</h1>
          <p className="text-surface-600">This submission has not been processed yet.</p>
        </div>
      </div>
    );
  }

  let contextInfo: ContextInfo | null = null;
  if (raw.bundleVersionId) {
    try {
      const context = await getGradingContext(raw.bundleVersionId);
      if (context) {
        contextInfo = {
          courseName: context.rubric?.name,
          assignmentName: context.assignment?.name,
          version: context.bundleVersion,
        };
      }
    } catch {
      // context info is optional
    }
  }

  return (
    <ReportContent
      submission={raw as unknown as Submission}
      contextInfo={contextInfo}
      submissionId={params.id}
    />
  );
}
