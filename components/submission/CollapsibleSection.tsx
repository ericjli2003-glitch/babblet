'use client';

import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultExpanded?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultExpanded = true,
  headerRight,
  children,
  className = '',
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`bg-white rounded-2xl border border-surface-200 overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600">
              {icon}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-surface-900">{title}</h3>
            {subtitle && <p className="text-sm text-surface-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {headerRight}
          <ChevronDown
            className={`w-5 h-5 text-surface-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
