'use client';

import dynamic from 'next/dynamic';

/**
 * The game is loaded with `ssr: false`.
 *
 * WHY: Pixi touches `window`, `document` and WebGL the moment it initialises.
 * Next.js renders components on the server first, where none of those exist, so
 * a statically imported game would crash the build. `dynamic(..., { ssr: false })`
 * tells Next to skip it on the server and only load the chunk in the browser —
 * which also keeps ~400 KB of renderer out of the initial HTML payload.
 *
 * NOTE: `ssr: false` is only allowed inside a CLIENT component in the App Router,
 * which is why this page carries `'use client'`. A Server Component cannot opt a
 * child out of server rendering — the server has already committed to rendering
 * the tree by then.
 */
const GameCanvas = dynamic(() => import('@/components/GameCanvas').then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-[600px] w-[800px] items-center justify-center font-mono text-cyan-300/60">
      loading renderer…
    </div>
  ),
});

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 p-6">
      <h1 className="font-mono text-sm tracking-[0.3em] text-cyan-400/60">NEON BREAKOUT</h1>
      <GameCanvas />
      <p className="max-w-[800px] text-center font-mono text-xs text-cyan-100/40">
        ← → or A/D to move · mouse also steers · Space to launch · P/Esc pause · R restart
      </p>
    </main>
  );
}
