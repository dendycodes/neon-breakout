# Neon Breakout — PixiJS + TS game in Next.js, written to learn from (interview prep)

- [x] 1. Next.js + TS + Tailwind scaffold (pnpm)
- [x] 2. Deps kept per job ad: pixi.js, xstate + @xstate/react, rxjs, vitest
- [x] 3. Game.ts — Entity/Paddle/Ball/Brick + collision + rules, zero Pixi/React/DOM
- [x] 4. Renderer.ts — Pixi 8, draw-once/transform-after, explicit destroy
- [x] 5. input.ts — RxJS streams -> typed Intent, edge-triggered launch, blur fix
- [x] 6. gameMachine.ts — XState v5, 4 screens
- [x] 7. GameCanvas.tsx — React bridge + fixed-timestep loop + DOM HUD
- [x] 8. 17 vitest tests (NaN collision case, rules, determinism, machine refusals)
- [x] 9. Beginner-friendly rewrite of every comment (no assumed Pixi/RxJS/XState knowledge)
- [x] 10. All 4 OOP principles tagged inline as [OOP: ... / <bg term>] — grep -rn "OOP:" src
- [x] 11. README rewritten as a study guide: reading order, principle-by-principle, interview points
- [x] 12. Verified green: typecheck, lint, 17 tests, production build
