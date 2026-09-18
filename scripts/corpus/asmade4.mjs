import { launch, get, sleep } from './browser.mjs';
import { showAll } from './showall.mjs';
import fs from 'node:fs';
const ctx=await launch('prof-asmade'); const p=await ctx.newPage();
await get(p,'https://legislation.nsw.gov.au/browse/asmade');
const out={};
for(const yr of ['2024','2025','2026']){
  for(const coll of ['epi','sl']){
    await p.evaluate(h=>{location.hash=h;},`#/${coll}/year/${yr}`);
    await p.waitForTimeout(5000);
    await showAll(p);
    const info=await p.evaluate(()=>document.body.innerText.match(/Showing 1 to [\d,]+ of [\d,]+ titles/)?.[0]||'');
    const rows=await p.$$eval('a[href*="/view/pdf/asmade/"]',as=>as.map(a=>({href:a.getAttribute('href'),title:(a.textContent||'').trim().replace(/\s+/g,' ')})));
    let n=0;
    for(const r of rows){ const id=r.href.split('/').pop();
      if(!id||!id.startsWith(coll)) continue;
      if(!out[id]){ out[id]={id,title:r.title,year:yr,coll,url:'https://legislation.nsw.gov.au'+r.href}; n++; } }
    console.log(`${coll}/${yr}: ${info} -> new ${n}`);
    await sleep(900);
  }
}
fs.writeFileSync('asmade-2024-2026.json',JSON.stringify(Object.values(out),null,2));
console.log('unique as-made 2024-2026:',Object.keys(out).length);
await ctx.close();
