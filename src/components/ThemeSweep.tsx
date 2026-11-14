import { useEffect, useRef, useState } from 'react';

/**
 * Plays a one-shot wave of light across the whole screen whenever the theme
 * changes, so switching between dark and light reads as light sweeping over the
 * interface rather than an instant flip.
 *
 * This component is the single owner of the `data-theme` attribute: it applies
 * the theme instantly on first mount, and animates it on later changes. The
 * overlay itself is decorative and non-interactive, and is skipped entirely for
 * users who prefer reduced motion.
 */
export function ThemeSweep({ theme }: { theme: 'light' | 'dark' }) {
  const [active, setActive] = useState(false);
  const [toLight, setToLight] = useState(false);
  const prev = useRef<'light' | 'dark' | null>(null);

  useEffect(() => {
    const root = document.documentElement;

    // First mount: the pre-paint script in index.html has already applied the
    // saved theme from localStorage. Adopt that as the baseline so the initial
    // settings load never animates (a dark-theme user must not see a sweep).
    if (prev.current === null) {
      const baseline = root.dataset.theme === 'dark' ? 'dark' : 'light';
      prev.current = theme;
      if (theme !== baseline) root.dataset.theme = theme;
      try {
        localStorage.setItem('lumen-theme', theme);
      } catch {
        /* private mode — ignore */
      }
      return;
    }
    if (prev.current === theme) return;
    prev.current = theme;

    try {
      localStorage.setItem('lumen-theme', theme);
    } catch {
      /* private mode — ignore */
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      root.dataset.theme = theme;
      return;
    }

    setToLight(theme === 'light');
    setActive(true);

    // Match the browser chrome (address bar / status bar) to the new theme.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f2f6fe' : '#050914');

    // Register the cross-fade transition first, force a reflow, then change the
    // attribute so the big surfaces animate instead of snapping.
    root.classList.add('theme-anim');
    void root.offsetHeight;
    root.dataset.theme = theme;

    const stop = window.setTimeout(() => {
      setActive(false);
      root.classList.remove('theme-anim');
    }, 1150);
    return () => {
      window.clearTimeout(stop);
      root.classList.remove('theme-anim');
    };
  }, [theme]);

  return (
    <div
      className={`theme-sweep${active ? ' active' : ''}${toLight ? ' to-light' : ' to-dark'}`}
      aria-hidden="true"
    />
  );
}
