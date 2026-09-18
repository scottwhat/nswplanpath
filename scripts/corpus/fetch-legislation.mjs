import { launch, get, sleep } from './browser.mjs';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const ROOT = process.env.CORPUS_ROOT;
const targets = JSON.parse(fs.readFileSync('targets.json','utf8'));
const lockPath = path.join(ROOT, 'manifest.lock.json');
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath,'utf8')) : {};
const ctx = await launch('profile'); const p = await ctx.newPage();
await get(p, 'https://legislation.nsw.gov.au/browse/inforce');

for (const t of targets) {
  const dest = path.join(ROOT, t.path);
  if (fs.existsSync(dest) && lock[t.doc_id]) { console.log(`SKIP  ${t.doc_id}`); continue; }
  const url = `https://legislation.nsw.gov.au/view/whole/html/inforce/current/${t.id}`;
  try {
    let html = await get(p, url, { settle: 2500 });
    // ensure lazy/whole content settled: retry once if suspiciously small
    if (html.length < 40000) { await sleep(4000); html = await p.content(); }
    const version = await p.evaluate(() => {
      const txt = document.body.innerText;
      const m = txt.match(/Current version (?:for|from)\s+([0-9]{1,2}\s+\w+\s+[0-9]{4})/i)
             || txt.match(/([0-9]{1,2}\s+\w+\s+[0-9]{4})\s+to date/i);
      return m ? m[1] : null;
    });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
    const sha = crypto.createHash('sha256').update(html).digest('hex');
    const meta = { metadataAttributes: {
      doc_id:{value:{type:'STRING',stringValue:t.doc_id},includeForEmbedding:false},
      title:{value:{type:'STRING',stringValue:t.title},includeForEmbedding:true},
      instrument_type:{value:{type:'STRING',stringValue:t.instrument_type},includeForEmbedding:true},
      scope:{value:{type:'STRING',stringValue:t.lga?'local':'state'},includeForEmbedding:false},
      lga:{value:{type:'STRING',stringValue:t.lga||'ALL'},includeForEmbedding:false},
      version:{value:{type:'STRING',stringValue:version||'unknown'},includeForEmbedding:false},
      authority_tier:{value:{type:'NUMBER',numberValue:t.tier},includeForEmbedding:false},
      source_url:{value:{type:'STRING',stringValue:url},includeForEmbedding:false},
    }};
    fs.writeFileSync(dest + '.metadata.json', JSON.stringify(meta,null,2));
    lock[t.doc_id] = { ...t, source_url:url, version, sha256:sha, bytes:html.length, downloaded_at:new Date().toISOString() };
    fs.writeFileSync(lockPath, JSON.stringify(lock,null,2));
    console.log(`OK    ${t.doc_id.padEnd(42)} ${String(html.length).padStart(9)} B  v=${version||'?'}`);
  } catch (e) {
    console.log(`FAIL  ${t.doc_id}  ${e.message.slice(0,90)}`);
  }
  await sleep(1200);
}
await ctx.close();
