import DashboardLayout from '@/components/DashboardLayout';

export default function BatchLoading() {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="relative mb-5">
            <div className="text-7xl animate-bounce" role="img" aria-label="Loading">🦉</div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-14 h-2.5 bg-surface-300 rounded-full opacity-40 animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold text-surface-900 mb-1">Loading assignment...</h3>
          <p className="text-sm text-surface-500">Babblet is fetching your data</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
