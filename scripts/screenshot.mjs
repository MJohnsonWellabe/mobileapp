// Screenshot capture for the adversarial visual QA loop (docs/07).
//
//   node scripts/screenshot.mjs --screen home --member dave
//   node scripts/screenshot.mjs --screen my-claims --member debbie --member todd
//   node scripts/screenshot.mjs --all
//   node scripts/screenshot.mjs --screen my-mailbox --member debbie --print
//
// Output lands in scripts/output/ as <screen>_<member>_<width>.png, which is
// gitignored. The visual-qa-reviewer subagent reads those PNGs and nothing else —
// it never sees source code, which is the entire point.
//
// The session is planted directly into sessionStorage via addInitScript rather than
// driven through the login form: it is faster, it cannot fail for reasons unrelated
// to the screen under review, and it lets any screen be captured directly.
//
// Chromium is the preinstalled build; do not run `playwright install`.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { listen } from './serve.mjs';

const CHROMIUM = '/opt/pw-browsers/chromium';
const OUT_DIR = 'scripts/output';

/** docs/01: a standard phone and a large phone / small tablet in portrait. */
export const BREAKPOINTS = [375, 430];

/** Screen registry. `path` is relative to the repo root; `needs` is the seeded
 *  member state that makes the screen interesting, used by --all. */
export const SCREENS = {
  login: { path: 'index.html', anon: true },
  home: { path: 'home.html' },
  more: { path: 'pages/more.html' },
  'my-information': { path: 'pages/my-information.html' },
  'my-coverages': { path: 'pages/my-coverages.html' },
  'my-payments': { path: 'pages/my-payments.html' },
  'my-claims': { path: 'pages/my-claims.html' },
  'my-mailbox': { path: 'pages/my-mailbox.html' },
  'my-rewards': { path: 'pages/my-rewards.html' },
  'my-health': { path: 'pages/my-health.html' },
  'my-care': { path: 'pages/my-care.html' },
  admin: { path: 'admin.html', admin: true },
};

/** Which members best exercise each screen, for the --all batch. Chosen from the
 *  per-member table in docs/03 — Dennis and April are in most lists on purpose,
 *  because their sparse states are where empty-state defects show up. */
export const BATCH = {
  login: ['anon'],
  home: ['dave', 'april', 'todd', 'dennis', 'matt'],
  more: ['dave', 'dennis'],
  'my-information': ['dave', 'sara'],
  'my-coverages': ['matt', 'april', 'dave'],
  'my-payments': ['april', 'matt', 'dave'],
  'my-claims': ['sara', 'todd', 'debbie', 'matt', 'dave'],
  'my-mailbox': ['debbie', 'april', 'dennis', 'matt'],
  'my-rewards': ['todd', 'dennis', 'april'],
  'my-health': ['todd', 'april', 'dennis', 'matt'],
  'my-care': ['eric', 'dave'],
  admin: ['admin'],
};

const MEMBER_IDS = {
  dave: 'user-dave', sara: 'user-sara', eric: 'user-eric', april: 'user-april',
  debbie: 'user-debbie', dennis: 'user-dennis', todd: 'user-todd', matt: 'user-matt',
  admin: 'user-admin',
};

function parseArgs(argv) {
  const out = { screens: [], members: [], all: false, print: false, widths: null, emulator: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--print') out.print = true;
    else if (a === '--no-emulator') out.emulator = false;
    else if (a === '--screen') out.screens.push(argv[++i]);
    else if (a === '--member') out.members.push(argv[++i]);
    else if (a === '--widths') out.widths = argv[++i].split(',').map(Number);
  }
  return out;
}

export async function capture({ screens, members, all, print, widths, emulator }) {
  const targets = [];
  if (all) {
    for (const [screen, list] of Object.entries(BATCH)) {
      for (const member of list) targets.push({ screen, member });
    }
  } else {
    for (const screen of screens) {
      const list = members.length ? members : SCREENS[screen]?.anon ? ['anon'] : ['dave'];
      for (const member of list) targets.push({ screen, member });
    }
  }
  if (!targets.length) {
    console.error('nothing to capture — pass --screen <name> or --all');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { server, origin } = await listen();
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const sizes = widths ?? BREAKPOINTS;
  const written = [];

  try {
    for (const { screen, member } of targets) {
      const def = SCREENS[screen];
      if (!def) {
        console.error(`unknown screen: ${screen}`);
        continue;
      }

      for (const width of sizes) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        });

        // Runs before any page script on every navigation, so the app boots
        // already signed in and already pointed at the emulator.
        await context.addInitScript(
          ({ session, useEmulator }) => {
            if (session) sessionStorage.setItem('wellabe.session', JSON.stringify(session));
            localStorage.setItem('wellabe.emulator', useEmulator ? '1' : '0');
          },
          {
            session:
              member === 'anon'
                ? null
                : {
                    userId: MEMBER_IDS[member] ?? `user-${member}`,
                    role: member === 'admin' ? 'admin' : 'member',
                    firstName: member[0].toUpperCase() + member.slice(1),
                  },
            useEmulator: emulator,
          },
        );

        const page = await context.newPage();
        const problems = [];
        page.on('pageerror', (e) => problems.push(String(e).split('\n')[0]));
        page.on('console', (m) => {
          if (m.type() === 'error' && !m.text().includes('favicon')) problems.push(m.text().slice(0, 160));
        });

        await page.goto(`${origin}/${def.path}`, { waitUntil: 'load' });
        await settle(page);

        if (print) await page.emulateMedia({ media: 'print' });

        const name = `${screen}_${member}_${width}${print ? '_print' : ''}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });
        written.push(name);
        console.log(`  ${name}${problems.length ? `   !! ${problems[0]}` : ''}`);

        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return written;
}

/** Wait for the app to finish painting real data rather than a fixed sleep: the
 *  screens set data-ready once their first render lands. Falls back after 8s so a
 *  broken screen still gets photographed — a blank screenshot is a finding, not a
 *  reason to hang the batch. */
async function settle(page) {
  await page
    .waitForFunction(() => document.body.dataset.ready === '1', { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(350);
}

if (process.argv[1].endsWith('screenshot.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  const files = await capture(args);
  console.log(`\n${files.length} screenshot(s) in ${OUT_DIR}/`);
}
