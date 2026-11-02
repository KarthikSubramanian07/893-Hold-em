// Rain on the window: thin streaks falling at a slight lean, and a few beads
// sliding down the glass. One canvas, no images. Under reduced motion it draws
// a single still frame.

import { useEffect, useRef } from 'react';
import { useReducedMotion } from './motion';

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface Bead {
  x: number;
  y: number;
  r: number;
  speed: number;
  pause: number;
}

export function Rain({ density = 1, className }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let streaks: Streak[] = [];
    let beads: Bead[] = [];
    let raf = 0;
    let last = performance.now();
    const lean = 0.18;

    const streak = (fresh: boolean): Streak => ({
      x: Math.random() * (w + h * lean),
      y: fresh ? Math.random() * h : -40 * dpr,
      len: (14 + Math.random() * 26) * dpr,
      speed: (900 + Math.random() * 700) * dpr,
      alpha: 0.05 + Math.random() * 0.16,
    });
    const bead = (): Bead => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (1 + Math.random() * 2.4) * dpr,
      speed: (6 + Math.random() * 40) * dpr,
      pause: Math.random() * 3,
    });

    const resize = () => {
      dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width * dpr));
      h = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      const n = Math.round(((w * h) / (dpr * dpr * 5200)) * density);
      streaks = Array.from({ length: n }, () => streak(true));
      beads = Array.from({ length: Math.round(n / 9) }, bead);
    };

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1 * dpr;
      for (const s of streaks) {
        s.y += s.speed * dt;
        s.x -= s.speed * dt * lean;
        if (s.y - s.len > h || s.x < -20) Object.assign(s, streak(false));
        ctx.strokeStyle = `rgba(206, 214, 228, ${s.alpha})`;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.len * lean, s.y - s.len);
        ctx.stroke();
      }
      for (const b of beads) {
        if (b.pause > 0) b.pause -= dt;
        else b.y += b.speed * dt;
        if (b.y > h + 10) Object.assign(b, bead(), { y: -10 });
        const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r * 1.6);
        g.addColorStop(0, 'rgba(255, 236, 214, 0.32)');
        g.addColorStop(0.5, 'rgba(180, 190, 210, 0.10)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);
    if (reduced) draw(0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, reduced]);

  return <canvas ref={ref} className={['rain', className].filter(Boolean).join(' ')} aria-hidden="true" />;
}
