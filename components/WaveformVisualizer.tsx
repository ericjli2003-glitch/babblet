'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface WaveformVisualizerProps {
  isActive: boolean;
  audioLevel: number;
  className?: string;
}

export default function WaveformVisualizer({ 
  isActive, 
  audioLevel,
  className = '',
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const barsRef = useRef<number[]>(Array(32).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      // Update bar heights
      barsRef.current = barsRef.current.map((bar, i) => {
        if (isActive) {
          // Create wave effect with audio level influence
          const baseHeight = Math.sin(Date.now() / 200 + i * 0.3) * 0.3 + 0.5;
          const targetHeight = baseHeight * (0.2 + audioLevel * 0.8);
          return bar + (targetHeight - bar) * 0.15;
        } else {
          return bar * 0.9;
        }
      });

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw bars
      const barWidth = canvas.width / barsRef.current.length;
      const gap = 2;

      barsRef.current.forEach((height, i) => {
        const x = i * barWidth + gap / 2;
        const barHeight = height * canvas.height * 0.8;
        const y = (canvas.height - barHeight) / 2;

        // Gradient color based on position and activity
        const hue = isActive ? 260 + (i / barsRef.current.length) * 40 : 220;
        const saturation = isActive ? 80 : 30;
        const lightness = isActive ? 60 + height * 20 : 50;
        
        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth - gap, barHeight, 3);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, audioLevel]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        className="w-full h-20"
      />
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-sm font-medium text-purple-400"
          >
            Listening...
          </motion.span>
        </motion.div>
      )}
    </div>
  );
}

