import { useEffect, useRef } from 'react';

/**
 * The animated environment behind the whole app: aurora blobs, a perspective
 * grid, an occasional light sweep, a vignette, and a field of drifting
 * particles drawn on a canvas.
 *
 * Everything here is decorative and GPU-friendly. The particle canvas pauses
 * when the tab is hidden and is skipped entirely when the user prefers reduced
 * motion.
 */
export function Background() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let width = 0;
    let height = 0;
    let dpr = 1;

    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number };
    let particles: P[] = [];

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scale the particle count to the viewport, but keep it modest.
      const count = Math.min(64, Math.round((width * height) / 26000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.9 + 0.5,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -(Math.random() * 0.3 + 0.06),
        a: Math.random() * 0.5 + 0.2,
      }));
    };

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -6) p.y = height + 6;
        if (p.x < -6) p.x = width + 6;
        if (p.x > width + 6) p.x = -6;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        glow.addColorStop(0, `rgba(150, 210, 255, ${p.a})`);
        glow.addColorStop(0.5, `rgba(0, 163, 255, ${p.a * 0.35})`);
        glow.addColorStop(1, 'rgba(0, 163, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      running = document.visibilityState === 'visible';
      if (running) raf = requestAnimationFrame(draw);
      else cancelAnimationFrame(raf);
    };

    build();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', build);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', build);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="bg-stage" aria-hidden="true">
      <div className="bg-aurora a1" />
      <div className="bg-aurora a2" />
      <div className="bg-aurora a3" />
      <div className="bg-grid" />
      <canvas ref={canvasRef} className="bg-particles" />
      <div className="bg-sweep" />
      <div className="bg-vignette" />
    </div>
  );
}
