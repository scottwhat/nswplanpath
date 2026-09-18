import { launch, get, sleep } from './browser.mjs';
import fs from 'node:fs';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const COLLECTIONS = ['act','epi','sl'];
const ctx = await launch('profile'); const p = await ctx.newPage();
await get(p, 'https://legislation.nsw.gov.au/browse/inforce');
const out = {};
for (const c of COLLECTIONS) {
  for (const L of LETTERS) {
    let rows = [];
    for (let attempt = 0; attempt < 3 && rows.length === 0; attempt++) {
      await p.evaluate(h => { location.hash = h; }, `#/${c}/title/${L}`);
      await p.waitForTimeout(3500 + attempt * 2500);
      rows = await p.$$eval('a[href*="/view/html/inforce/current/"]',
        as => as.map(a => ({ href: a.getAttribute('href'), title: a.textContent.trim().replace(/\s+/g,' ') })));
    }
    for (const r of rows) {
      const id = r.href.split('/').pop();
      if (!r.title || !id) continue;
      out[id] = { id, title: r.title, collection: id.split('-')[0], url: 'https://legislation.nsw.gov.au' + r.href };
    }
    process.stderr.write(`${c}/${L}=${rows.length} `);
    await sleep(1000);
  }
  process.stderr.write('\n');
}
fs.writeFileSync('index-inforce.json', JSON.stringify(Object.values(out), null, 2));
console.log('\nTOTAL UNIQUE:', Object.keys(out).length);
await ctx.close();
