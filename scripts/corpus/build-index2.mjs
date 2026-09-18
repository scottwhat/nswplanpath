import { launch, get, sleep } from './browser.mjs';
import { showAll } from './showall.mjs';
import fs from 'node:fs';
const ctx=await launch('prof-idx'); const p=await ctx.newPage();
await get(p,'https://legislation.nsw.gov.au/browse/inforce');
const out={};
for(const c of ['act','epi','sl']){
  for(const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')){
    await p.evaluate(h=>{location.hash=h;},`#/${c}/title/${L}`);
    await p.waitForTimeout(3500);
    await showAll(p);
    const rows=await p.$$eval('a[href*="/view/html/inforce/current/"]',
      as=>as.map(a=>({href:a.getAttribute('href'),title:a.textContent.trim().replace(/\s+/g,' ')})));
    for(const r of rows){ const id=r.href.split('/').pop();
      if(id&&r.title) out[id]={id,title:r.title,collection:id.split('-')[0],url:'https://legislation.nsw.gov.au'+r.href}; }
    process.stderr.write(`${c}/${L}=${rows.length} `);
    await sleep(600);
  }
  process.stderr.write('\n');
}
fs.writeFileSync('index-inforce.json',JSON.stringify(Object.values(out),null,2));
console.log('\nTOTAL UNIQUE:',Object.keys(out).length);
await ctx.close();
