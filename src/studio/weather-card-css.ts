// Styles for the wedding-day weather card (src/studio/weather-card.ts), kept apart so pages can
// include them without loading the map code.
export const WEATHER_CSS = `
  .wx-card .card-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
  .wx-head { align-items: flex-start; flex-wrap: wrap; }
  .wx-play { padding: 6px 12px; border: 1px solid #ddd3c4; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; cursor: pointer; color: var(--ink, #2b2d1f); }
  .wx-note { color: #888; font-size: 13px; }
  .wx-head h2 { margin: 0; }
  .wx-sub { margin: 2px 0 0; font-size: 13px; color: #777; }
  .wx-tabs { display: flex; gap: 4px; }
  .wx-tabs button { padding: 6px 12px; border: 1px solid #ddd3c4; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; cursor: pointer; color: var(--ink, #2b2d1f); }
  .wx-tabs button[aria-selected="true"] { background: var(--green, #5a5e3b); border-color: var(--green, #5a5e3b); color: #fff; }
  .wx-day { display: grid; grid-template-columns: auto repeat(4, minmax(0, 1fr)); gap: 12px; align-items: center; margin: 12px 0 10px; padding: 12px 16px; background: #f6f1ea; border-radius: 18px 0; }
  .wx-day div { display: flex; flex-direction: column; font-size: 12px; color: #777; line-height: 1.35; }
  .wx-day strong { font-size: 15px; font-weight: 600; color: var(--ink, #2b2d1f); }
  .wx-big { font-size: 34px; line-height: 1; }
  .wx-sun { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: #666; margin: 0 0 12px; }
  .wx-sun b { color: var(--ink, #2b2d1f); font-weight: 600; }
  .wx-sun .wx-gold::before { content: ''; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #e0b64a; margin-right: 5px; vertical-align: 0; }
  .wx-hours { display: flex; gap: 2px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x proximity; }
  .wx-h { flex: 0 0 58px; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 2px; border-radius: 12px 0; font-size: 12px; color: #666; border-top: 3px solid transparent; scroll-snap-align: start; }
  .wx-h.is-gold { border-top-color: #e0b64a; background: #fdf7e6; }
  .wx-h.is-event { background: #eef0e4; outline: 1.5px solid var(--green, #5a5e3b); outline-offset: -1.5px; }
  .wx-h.is-event .wx-t { color: var(--green, #5a5e3b); font-weight: 700; }
  .wx-t { font-weight: 600; color: var(--ink, #2b2d1f); white-space: nowrap; }
  .wx-i { font-size: 20px; line-height: 1.2; }
  .wx-temp { font-size: 15px; font-weight: 600; color: var(--ink, #2b2d1f); }
  .wx-bar { width: 10px; height: 34px; background: #eef2f6; border-radius: 3px; display: flex; align-items: flex-end; overflow: hidden; }
  .wx-bar i { display: block; width: 100%; background: #4a86c5; }
  .wx-pop.hi { color: #2c6aa8; font-weight: 700; }
  .wx-mm { min-height: 1.2em; font-size: 11px; color: #2c6aa8; }
  .wx-wind small { margin-left: 2px; font-size: 10px; color: #999; }
  .wx-key { margin: 6px 0 0; font-size: 12px; color: #888; }
  .wx-key span { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: -1px; margin: 0 3px 0 8px; }
  .wx-key span:first-child { margin-left: 0; }
  .wx-key .k-gold { background: #e0b64a; }
  .wx-key .k-event { border: 1.5px solid var(--green, #5a5e3b); background: #eef0e4; }
  .wx-map { height: 360px; border-radius: 18px 0; overflow: hidden; z-index: 0; }
  .wx-radar-bar { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 13px; }
  .wx-frame-time { font-weight: 600; color: var(--ink, #2b2d1f); min-width: 64px; }
  .wx-foot { margin: 10px 0 0; font-size: 12px; color: #999; }
  .wx-card.wx-off { display: none; }
  @media (max-width: 640px) { .wx-day { grid-template-columns: auto 1fr 1fr; } }
`;
