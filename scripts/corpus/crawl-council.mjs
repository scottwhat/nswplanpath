import { launch, get, sleep } from './browser.mjs';
import fs from 'node:fs';
const seeds = JSON.parse(process.env.SEEDS);      // array of urls
const slug  = process.env.SLUG;
const FOLLOW = /dcp|development-control|contribution|s7-?1[12]|section-7|fee|charge|flood|condition|planning-control|lep|policy|plan/i;
const ctx = await launch(process.env.PROFILE||'profile2'); const p = await ctx.newPage();
const seen = new Set(), pdfs = new Map(); const host = new URL(seeds[0]).host;
let queue = seeds.map(u => [u,0]);
while (queue.length) {
  const [url, d] = queue.shift();
  if (seen.has(url) || d > (+process.env.DEPTH||2) || seen.size > (+process.env.MAXPAGES||60)) continue;
  seen.add(url);
  try { await get(p, url, { tries:2, settle:1200 }); } catch { continue; }
  const links = await p.$$eval('a[href]', as => as.map(a => ({ h:a.href, t:(a.textContent||'').trim().replace(/\s+/g,' ').slice(0,140) })));
  for (const { h, t } of links) {
    let u; try { u = new URL(h); } catch { continue; }
    if (u.host !== host) continue;
    u.hash = '';
    const s = u.toString();
    if (/\.pdf($|\?)/i.test(s)) { if (!pdfs.has(s)) pdfs.set(s, t); }
    else if (d < (+process.env.DEPTH||2) && FOLLOW.test(s) && !seen.has(s)) queue.push([s, d+1]);
  }
  process.stderr.write(`.`);
  await sleep(1000);   // ~1 req/sec per manifest
}
fs.writeFileSync(`pdfs-${slug}.json`, JSON.stringify([...pdfs].map(([url,text])=>({url,text})), null, 2));
console.log(`\n${slug}: crawled ${seen.size} pages, found ${pdfs.size} PDFs`);
await ctx.close();
