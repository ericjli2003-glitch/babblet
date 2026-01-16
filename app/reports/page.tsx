'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { BarChart3, FileText } from 'lucide-react';

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-surface-900">Reports</h1>
          <p className="text-surface-500 mt-1">View analytics and export grading reports</p>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">Coming Soon</h3>
          <p className="text-surface-500">Analytics and reporting features are under development</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
