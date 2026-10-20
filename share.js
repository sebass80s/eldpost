(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock = n => String(Math.floor((n % 1440 + 1440) % 1440 / 60)).padStart(2,'0') + ':' + String((n % 60 + 60) % 60).padStart(2,'0');
  const minutes = n => Math.floor(n/60) + ' h' + (n%60 ? ' ' + n%60 + ' min' : '');
  const types = { fire:'Eldpost',patrol:'Patrull',guard:'Vaktpost' };
  async function unpack(encoded) {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 15000) throw Error('Ogiltig eller för lång länk.');
    const str = encoded.replace(/-/g,'+').replace(/_/g,'/');
    const raw = atob(str);
    const bytes = Uint8Array.from(raw, x=>x.charCodeAt(0));
    if (!('DecompressionStream' in window)) throw Error('Webbläsaren stöder inte delade scheman.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    if (text.length > 100000) throw Error('Schemat är för stort.');
    return JSON.parse(text);
  }
  async function start(){
    try {
      const fragment = location.hash.slice(1);
      if (!fragment.startsWith('s=')) throw Error('Schemalänken saknas.');
      const data = await unpack(fragment.slice(2));
      if (data.v !== 1 || !Array.isArray(data.n) || data.n.length > 14 || !Array.isArray(data.p) || data.p.length > 20) throw Error('Ogiltigt schema.');
      const people = new Map(data.p.map(p=>[p[0], {name:String(p[1]).slice(0,80),place:p[2]}]));
      $('shareTitle').textContent = 'Från ' + data.d + ' · ' + data.n.length + ' nätter';
      $('shareNights').innerHTML = data.n.map((night,i)=>{
        if (!Array.isArray(night) || night.length>200) return '';
        const rows=night.map(a=>{
          if (!Array.isArray(a)||!types[a[0]]) return '';
          const ids=Array.isArray(a[3])?a[3]:[];
          const persons=ids.map(id=>people.get(id)).filter(Boolean).map(p=>esc(p.name)+' · plats '+esc(p.place)).join(' + ');
          return '<div class="schedule-row"><div class="schedule-time">'+clock(a[1])+'–'+clock(a[2])+'</div><div class="schedule-duty"><div class="assignment '+a[0]+'"><span class="kind">'+types[a[0]]+'</span><span>'+persons+'</span></div></div></div>';
        }).join('');
        const day=new Date(data.d+'T12:00:00');day.setDate(day.getDate()+i);
        const date=Number.isFinite(day.getTime()) ? new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium'}).format(day):'';
        return '<h3>Natt '+(i+1)+' · '+esc(date)+'</h3><div class="schedule-table">'+rows+'</div>';
      }).join('');
    } catch(e) { $('shareTitle').textContent='Schemat kunde inte öppnas';$('shareError').textContent=e.message; }
  }
  start();
})();