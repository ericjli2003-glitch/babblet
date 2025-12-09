import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Babblet - Real-Time AI Presentation Analysis',
  description: 'AI-powered tool for professors to analyze student presentations in real-time, generate insightful questions, and provide structured feedback.',
  keywords: ['presentation', 'AI', 'education', 'analysis', 'professor', 'student', 'Babblet'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-gradient-to-br from-surface-50 via-white to-surface-100">
        <div className="relative min-h-screen">
          {/* Background decorations */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary-500/10 to-accent-500/10 rounded-full blur-3xl" />
            <div className="absolute top-1/2 -left-40 w-96 h-96 bg-gradient-to-tr from-accent-500/5 to-primary-500/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-40 right-1/3 w-72 h-72 bg-gradient-to-tl from-primary-500/10 to-accent-500/10 rounded-full blur-3xl" />
          </div>
          
          {/* Main content */}
          <div className="relative z-10">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}

