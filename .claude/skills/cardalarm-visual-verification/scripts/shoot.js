// Screenshot every customer screen at phone and desktop widths in light and dark.
// Usage: node shoot.js <outDir> [baseUrl]
// Needs playwright (global install is fine) and a Chromium at PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers/chromium.
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = playwright;

const out = process.argv[2] || './shots';
const base = process.argv[3] || 'http://localhost:3111';
fs.mkdirSync(out, { recursive: true });

const SCREENS = [
  // [name, path, fullPage]
  ['landing', '/', true],
  ['login', '/login', false],
  ['signup', '/signup', false],
  ['dashboard', '/dashboard', false],
  ['dashboard-p2', '/dashboard?page=2', false],
  ['dashboard-possible', '/dashboard?matchStatus=possible', false],
  ['saved', '/saved', false],
  ['watchlists', '/watchlists', true],
  ['watchlist-detail', '/watchlists/1', true],
  ['watchlist-quick', '/watchlists/new?quick=1', false],
  ['watchlist-new', '/watchlists/new', true],
  ['not-found', '/does-not-exist', false],
];
const VIEWPORTS = [['phone', 360, 740], ['desktop', 1280, 900]];
const THEMES = ['light', 'dark'];

const palettes = [['#1d3557', '#e63946'], ['#2a9d8f', '#264653'], ['#7b2cbf', '#240046'], ['#f4a261', '#6a040f'], ['#3a86ff', '#0b132b'], ['#d62828', '#003049'], ['#06d6a0', '#073b4c'], ['#ffbe0b', '#3a0ca3']];
// Stand-in card art for the seeded cdn.shopify.com image URLs (the real CDN is unreachable from the sandbox).
function cardSvg(n) {
  const [a, b] = palettes[n % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="500" height="700" fill="#fff"/><rect x="18" y="18" width="464" height="664" rx="10" fill="url(#g)"/><circle cx="250" cy="300" r="120" fill="rgba(255,255,255,.18)"/><rect x="60" y="500" width="380" height="14" rx="7" fill="rgba(255,255,255,.7)"/><rect x="60" y="535" width="260" height="10" rx="5" fill="rgba(255,255,255,.4)"/></svg>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  let problems = 0;
  for (const theme of THEMES) {
    for (const [vp, width, height] of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      const page = await ctx.newPage();
      await page.route(/cdn\.shopify\.com\/s\/files\/seed\/card-(\d+)\.jpg/, route => {
        const n = Number(route.request().url().match(/card-(\d+)/)[1]);
        route.fulfill({ status: 200, contentType: 'image/svg+xml', body: cardSvg(n) });
      });
      for (const [name, route, full] of SCREENS) {
        try {
          await page.goto(base + route, { waitUntil: 'networkidle', timeout: 90000 });
          await page.waitForTimeout(300);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
          await page.screenshot({ path: path.join(out, `${theme}-${vp}-${name}.png`), fullPage: full });
          if (overflow) { problems++; console.log(`OVERFLOW  ${theme} ${vp} ${name}`); }
        } catch (e) { problems++; console.log(`ERROR     ${theme} ${vp} ${name}: ${e.message.split('\n')[0]}`); }
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`done: ${THEMES.length * VIEWPORTS.length * SCREENS.length} shots in ${out}, ${problems} problem(s)`);
  process.exit(problems ? 1 : 0);
})();
