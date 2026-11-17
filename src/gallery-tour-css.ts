// Styles for the gallery tour (src/gallery-tour.ts), kept apart so the page can include them at build time.
export const TOUR_CSS = `
  .tour { position: fixed; inset: 0; z-index: 200; animation: tour-fade 0.3s ease both; }
  .tour.out { animation: tour-fade 0.25s ease reverse both; }
  @keyframes tour-fade { from { opacity: 0; } }
  .tour-spot { position: fixed; border-radius: 16px 0; box-shadow: 0 0 0 200vmax rgb(20 20 16 / 0.62); transition: all 0.45s cubic-bezier(0.2, 0.8, 0.2, 1); pointer-events: none; }
  .tour-hand { position: fixed; z-index: 2; pointer-events: none; transition: left 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s; animation: tour-tap 1.6s ease-in-out infinite; filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.35)); }
  .tour-hand .ring { fill: none; stroke: #fff; stroke-width: 2; opacity: 0; transform-origin: 16px 12px; animation: tour-ring 1.6s ease-out infinite; }
  @keyframes tour-tap { 0%, 100% { transform: translate(0, 0) scale(1); } 45% { transform: translate(-3px, -6px) scale(1); } 55% { transform: translate(0, 0) scale(0.92); } }
  @keyframes tour-ring { 0%, 50% { opacity: 0; transform: scale(0.4); } 60% { opacity: 0.9; } 100% { opacity: 0; transform: scale(1.6); } }
  .tour-card { position: fixed; z-index: 3; box-sizing: border-box; background: #fff; color: #2b2d1f; border-radius: 22px 0; padding: 18px 20px 14px; box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.6); transition: top 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), left 0.45s cubic-bezier(0.2, 0.8, 0.2, 1); max-width: calc(100vw - 24px); }
  .tour-card.in { animation: tour-card 0.4s ease both; }
  @keyframes tour-card { from { opacity: 0; transform: translateY(6px); } }
  .tour-card h2 { margin: 4px 0 6px; font-size: 20px; font-weight: 400; letter-spacing: 0.01em; }
  .tour-card p { margin: 0 0 12px; font-size: 15px; line-height: 1.55; color: #4a4a44; }
  .tour-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .tour-dots { display: flex; gap: 5px; }
  .tour-dots i { width: 7px; height: 7px; border-radius: 50%; background: #e3ddd2; }
  .tour-dots i.on { background: #5a5e3b; }
  .tour-btns { display: flex; gap: 6px; }
  .tour-btns button { font: inherit; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; padding: 8px 14px; border-radius: 12px 0; border: 1px solid #ddd3c4; background: #fff; color: #2b2d1f; cursor: pointer; }
  .tour-btns .tour-next { background: #5a5e3b; border-color: #5a5e3b; color: #fff; }
  .tour-btns .tour-skip { border-color: transparent; color: #888; }
  .tour-art:empty { display: none; }
  .tour-art { margin-bottom: 10px; }
  .tour-cover { display: block; width: 100%; max-height: 180px; object-fit: cover; border-radius: 14px 0; }
  .tour-fav { position: relative; width: 150px; margin: 0 auto; }
  .tour-ph, .tour-fav .blank { display: block; width: 150px; height: 100px; object-fit: cover; border-radius: 10px 0; background: #eee; }
  .tour-heart { position: absolute; left: 8px; bottom: 8px; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: #fff; font-size: 18px; color: #c9c3b8; animation: tour-heart 2.4s ease-in-out infinite; }
  @keyframes tour-heart { 0%, 35% { color: #c9c3b8; transform: scale(1); } 45% { color: #c0392b; transform: scale(1.35); } 55%, 100% { color: #c0392b; transform: scale(1); } }
  .tour-lists { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
  .tour-chip { padding: 6px 12px; border-radius: 999px; background: #f6f1ea; font-size: 13px; animation: tour-pop 0.5s ease both; }
  .tour-chip b { margin-left: 4px; color: #5a5e3b; }
  .tour-chip.d1 { animation-delay: 0.5s; } .tour-chip.d2 { animation-delay: 1s; }
  @keyframes tour-pop { from { opacity: 0; transform: scale(0.8); } }
  .tour-sel { display: flex; gap: 6px; justify-content: center; }
  .tour-t { position: relative; width: 64px; height: 64px; border-radius: 8px 0; overflow: hidden; background: #eee; }
  .tour-t img, .tour-t .blank { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tour-t i { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; background: #5a5e3b; color: #fff; font-size: 12px; font-style: normal; display: grid; place-items: center; opacity: 0; }
  .tour-t.on { animation: tour-pick 3s ease infinite; animation-delay: var(--d); }
  .tour-t.on i { animation: tour-tick 3s ease infinite; animation-delay: var(--d); }
  @keyframes tour-pick { 0%, 20% { box-shadow: none; } 30%, 90% { box-shadow: 0 0 0 3px #5a5e3b; } }
  @keyframes tour-tick { 0%, 20% { opacity: 0; } 30%, 90% { opacity: 1; } 100% { opacity: 0; } }
  .tour-share { text-align: center; }
  .tour-row { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid #ece4d7; border-radius: 12px 0; text-align: left; font-size: 14px; }
  .tour-row small { display: block; color: #888; }
  .tour-row > span:nth-child(2) { flex: 1; }
  .tour-mini, .tour-row .blank { width: 44px; height: 44px; object-fit: cover; border-radius: 6px 0; background: #eee; }
  .tour-btn { padding: 5px 12px; border-radius: 10px 0; border: 1px solid #5a5e3b; color: #5a5e3b; font-size: 12px; animation: tour-press 3s ease infinite; }
  @keyframes tour-press { 0%, 30% { background: #fff; color: #5a5e3b; } 38%, 100% { background: #5a5e3b; color: #fff; } }
  .tour-copied { display: inline-block; margin-top: 8px; font-size: 13px; color: #5a5e3b; animation: tour-copied 3s ease infinite; }
  @keyframes tour-copied { 0%, 40% { opacity: 0; transform: translateY(4px); } 50%, 90% { opacity: 1; transform: none; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .tour *, .tour { animation: none !important; transition: none !important; } .tour-heart { color: #c0392b; } .tour-t.on i { opacity: 1; } .tour-copied { opacity: 1; } }
`;
