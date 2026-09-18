// select "All" in the DataTables length dropdown and wait for the table to redraw
export async function showAll(p){
  const ok = await p.evaluate(()=>{
    const sel=document.querySelector('#table_1_length select');
    if(!sel) return false;
    const all=[...sel.options].find(o=>o.value==='100000');
    if(!all) return false;
    if(sel.value==='100000') return true;
    sel.value='100000';
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  });
  if(!ok) return false;
  for(let i=0;i<40;i++){
    await p.waitForTimeout(700);
    const t=await p.evaluate(()=>document.body.innerText.match(/Showing 1 to ([\d,]+) of ([\d,]+)/)?.slice(1));
    if(t && t[0].replace(/,/g,'')===t[1].replace(/,/g,'')) return true;
  }
  return true;
}
