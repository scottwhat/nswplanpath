import { launch, sleep } from './browser.mjs';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const ROOT = process.env.CORPUS_ROOT;
const list = JSON.parse(fs.readFileSync(process.env.LIST,'utf8'));
const lockPath = path.join(ROOT,'manifest.lock.json');
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath,'utf8')) : {};
const ctx = await launch(process.env.PROFILE || 'profile2');
const page = await ctx.newPage();
for (const t of list) {
  const dest = path.join(ROOT, t.path);
  if (fs.existsSync(dest) && lock[t.doc_id]) { console.log(`SKIP  ${t.doc_id}`); continue; }
  try {
    // warm origin so cookies/WAF clearance apply
    const origin = new URL(t.url).origin;
    if (!ctx.__warmed?.has?.(origin)) {
      try { await page.goto(origin, { waitUntil:'domcontentloaded', timeout:45000 }); await sleep(2500); } catch {}
      (ctx.__warmed ||= new Set()).add(origin);
    }
    let buf = null, ct = '';
    try {
      const resp = await page.request.get(t.url, { timeout: 120000, headers: { 'Referer': origin + '/' } });
      if (!resp.ok()) throw new Error('HTTP ' + resp.status());
      buf = await resp.body(); ct = resp.headers()['content-type'] || '';
    } catch (e1) {
      // fallback: fetch from inside the page (same-origin, carries WAF/session cookies)
      const b64 = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ab = await r.arrayBuffer();
        let s = ''; const bytes = new Uint8Array(ab); const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return btoa(s);
      }, t.url);
      buf = Buffer.from(b64, 'base64');
    }
    if (t.path.endsWith('.pdf') && !buf.slice(0,5).toString().includes('%PDF')) throw new Error('not a PDF (ct='+ct+')');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    const meta = { metadataAttributes: {
      doc_id:{value:{type:'STRING',stringValue:t.doc_id},includeForEmbedding:false},
      title:{value:{type:'STRING',stringValue:t.title},includeForEmbedding:true},
      instrument_type:{value:{type:'STRING',stringValue:t.instrument_type},includeForEmbedding:true},
      scope:{value:{type:'STRING',stringValue:t.lga?'local':'state'},includeForEmbedding:false},
      lga:{value:{type:'STRING',stringValue:t.lga||'ALL'},includeForEmbedding:false},
      version:{value:{type:'STRING',stringValue:t.version||'unknown'},includeForEmbedding:false},
      authority_tier:{value:{type:'NUMBER',numberValue:t.tier},includeForEmbedding:false},
      source_url:{value:{type:'STRING',stringValue:t.url},includeForEmbedding:false},
    }};
    fs.writeFileSync(dest+'.metadata.json', JSON.stringify(meta,null,2));
    lock[t.doc_id] = { ...t, source_url:t.url, sha256:crypto.createHash('sha256').update(buf).digest('hex'), bytes:buf.length, downloaded_at:new Date().toISOString() };
    fs.writeFileSync(lockPath, JSON.stringify(lock,null,2));
    console.log(`OK    ${t.doc_id.padEnd(44)} ${String(buf.length).padStart(9)} B`);
  } catch(e) { console.log(`FAIL  ${t.doc_id.padEnd(44)} ${e.message.slice(0,80)}`); }
  await sleep(1100);
}
await ctx.close();
