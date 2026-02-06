'use client';

import { Suspense, useState } from 'react';
import { Sparkles, Lock, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const next = searchParams.get('next') || '/courses';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (data.success) {
        router.push(next);
      } else {
        setError('Incorrect password.');
        setPassword('');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-center gap-2 mb-10">
        <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <span className="text-2xl font-semibold text-surface-900">Babblet</span>
      </div>

      <div className="rounded-2xl border border-surface-200 bg-white/80 backdrop-blur shadow-soft p-8">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-100 mx-auto mb-4">
          <Lock className="w-6 h-6 text-surface-500" />
        </div>
        <h1 className="text-xl font-semibold text-surface-900 text-center mb-1">Access Required</h1>
        <p className="text-sm text-surface-500 text-center mb-6">Enter the password to continue.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoFocus
            className="w-full px-4 py-3 bg-white border border-surface-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          />
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Checking...' : 'Continue'}
          </button>
        </form>
      </div>

      <div className="mt-6 text-center">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-700 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-sky-50 via-white to-white px-4">
      <Suspense fallback={<div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
