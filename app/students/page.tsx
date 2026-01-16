'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { Users } from 'lucide-react';

export default function StudentsPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-surface-900">Students</h1>
          <p className="text-surface-500 mt-1">Manage student roster and view performance</p>
        </div>

        <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 mb-2">Coming Soon</h3>
          <p className="text-surface-500">Student management features are under development</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
