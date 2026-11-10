import { useEffect, useRef, useState } from 'react';

/** True when the visitor asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Counts a number up to `target` with an ease-out curve. Returns the current
 * value; pass it through your formatter. Respects reduced motion by jumping
 * straight to the target.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + delta * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/**
 * Subtle pointer-tracking tilt for cards. Attaches listeners on the element and
 * writes a transform directly (no React re-render). Disabled for reduced motion
 * and on touch devices.
 */
export function useTilt<T extends HTMLElement>(max = 6) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (window.matchMedia('(hover: none)').matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // A restrained tilt plus a pointer-follow light position, both cheap
        // enough to write directly to style without a React re-render.
        el.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${
          -py * max
        }deg) translateY(-3px)`;
        el.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
        el.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
      el.style.removeProperty('--gx');
      el.style.removeProperty('--gy');
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [max]);

  return ref;
}

/**
 * Adds a class once the element scrolls into view, so reveals can be triggered
 * on scroll rather than all at once on mount. Falls back to visible when
 * IntersectionObserver is unavailable.
 */
export function useReveal<T extends HTMLElement>(className = 'reveal') {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      el.classList.add(className);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add(className);
            io.unobserve(el);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [className]);

  return ref;
}
