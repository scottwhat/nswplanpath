import { chromium } from 'playwright';
import path from 'node:path';
export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export async function launch(profile='profile') {
  return await chromium.launchPersistentContext(path.resolve(profile), {
    headless: true,
    executablePath: process.env.CHROME_BIN,
    userAgent: UA, locale: 'en-AU', timezoneId: 'Australia/Sydney',
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled','--no-sandbox'],
  });
}
const CHALLENGE = /just a moment|checking your browser|enable javascript and cookies|verifying you are human/i;
/** Navigate and wait out any Cloudflare interstitial. Returns final HTML. */
export async function get(page, url, { tries = 4, settle = 1500 } = {}) {
  for (let t = 1; t <= tries; t++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); }
    catch (e) { if (t === tries) throw e; await page.waitForTimeout(4000); continue; }
    for (let i = 0; i < 30; i++) {
      const title = await page.title().catch(() => '');
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || '').catch(() => '');
      if (!CHALLENGE.test(title) && !CHALLENGE.test(body) && body.length > 50) {
        await page.waitForTimeout(settle);
        return await page.content();
      }
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(3000);
  }
  throw new Error('challenge not cleared: ' + url);
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
