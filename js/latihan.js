/* Latihan kosakata interaktif — retrieval practice + pengulangan kata yang sering salah.
   Mayer: satu kata per layar (segmenting); audio + hanzi + arti ditampilkan berdekatan
   saat umpan balik (contiguity); tanpa hiasan selain penanda benar/salah (coherence). */

const VSTATS_KEY = 'tocflmini_vocab_stats';

const Latihan = {
  session: null,
  MODES: {
    kartu:  { ic: '🗂️', name: T('Flashcards', 'Kartu kilat'), desc: T('See the word, recall its meaning, then flip the card. Be honest with yourself.', 'Lihat kata, ingat artinya, lalu balik kartunya. Jujur pada dirimu sendiri.') },
    dengar: { ic: '🎧', name: T('Listen → Meaning', 'Dengar → Arti'), desc: T('Sound only, no text — trains your ear like 聽力.', 'Hanya suara, tanpa tulisan — melatih telinga seperti 聽力.') },
    hanzi:  { ic: '📖', name: T('Hanzi → Meaning', 'Hanzi → Arti'), desc: T('Recognise the written word without pinyin — like 閱讀.', 'Kenali kata tertulis tanpa pinyin — seperti 閱讀.') },
    arti:   { ic: '🔁', name: T('Meaning → Hanzi', 'Arti → Hanzi'), desc: T('From English, choose the right hanzi.', 'Dari bahasa Indonesia, pilih hanzi yang tepat.') },
  },

  stats() { return Store.get(VSTATS_KEY, {}); },
  id(code, w) { return `${code}:${w}`; },
  weak(s) { return s && s.w > s.r; },

  words(vol, codes) {
    const out = [];
    for (const m of App.volData[vol].modules) {
      if (codes && !codes.includes(m.code)) continue;
      for (const [layer, list] of [['core', m.vocab.core], ['sup', m.vocab.supplement]])
        for (const v of list) out.push({ ...v, code: m.code, layer, id: this.id(m.code, v.w) });
    }
    return out;
  },
  opened(vol) { return App.plan[vol].filter(m => App.status(m.code) !== 'new').map(m => m.code); },

  menu(vol) {
    const st = this.stats(), all = this.words(vol), opened = this.opened(vol);
    const seen = all.filter(v => st[v.id]).length, weak = all.filter(v => this.weak(st[v.id])).length;
    const scope = this._scope || (opened.length ? 'buka' : 'semua');
    const scopes = [['buka', `${T('Opened', 'Sudah dibuka')} · ${opened.length}`, opened.length], ['semua', `${T('All', 'Semua')} · ${App.plan[vol].length}`, 1],
                    ['sulit', `${T('Hard words', 'Kata sulit')} · ${weak}`, weak]];
    return `
      <div class="stats3">
        <div>${App.ring(Math.round(seen / all.length * 100), `${seen}`)}<small>${T('words practised', 'kata pernah dilatih')}</small></div>
        <div>${App.ring(all.length ? Math.round((seen - weak) / all.length * 100) : 0, `${seen - weak}`, 'ring-ok')}<small>${T('mostly right', 'lebih sering benar')}</small></div>
        <div>${App.ring(all.length ? Math.round(weak / all.length * 100) : 0, `${weak}`, 'ring-warn')}<small>${T('hard words', 'kata sulit')}</small></div>
      </div>
      <div class="field-k">${T('Take words from modules…', 'Ambil kata dari modul…')}</div>
      <div class="seg wrap">${scopes.map(([k, l, ok]) => `<button class="${k === scope ? 'on' : ''}" ${ok ? '' : 'disabled'} onclick="Latihan._scope='${k}';App.route()">${l}</button>`).join('')}</div>
      <div class="field-k">${T('Choose a practice mode · 10 words per session', 'Pilih cara latihan · 10 kata per sesi')}</div>
      <div class="mode-list">${Object.entries(this.MODES).map(([k, m]) => `
        <button class="card mode-card" onclick="Latihan.startScope(${vol}, '${k}')">
          ${Pic.html(m.ic, 'mode-ic')}<div><b>${m.name}</b><span>${m.desc}</span></div><span class="chev">›</span></button>`).join('')}
      </div>
      <p class="hint">${T('Words you miss will come back more often until you get them right more often than wrong.', 'Kata yang salah akan lebih sering muncul lagi sampai kamu lebih sering benar daripada salah.')}</p>`;
  },
  startScope(vol, mode) {
    const scope = this._scope || (this.opened(vol).length ? 'buka' : 'semua');
    if (scope === 'sulit') return this.start({ vol, mode, weakOnly: true });
    this.start({ vol, mode, codes: scope === 'buka' ? this.opened(vol) : null });
  },

  /* Pilih 10 kata: kata sulit & belum pernah dilatih didahulukan, sisanya acak */
  start({ vol, codes = null, mode = 'dengar', weakOnly = false, from = null, list = null }) {
    const st = this.stats();
    let pool = list || this.words(vol, codes);
    if (weakOnly) pool = pool.filter(v => this.weak(st[v.id]));
    if (!pool.length) return App.toast(T('No words to practise yet.', 'Belum ada kata untuk dilatih.'));
    const prio = v => { const s = st[v.id]; return !s ? 1 : this.weak(s) ? 0 : 2 + (s.r - s.w) * 0.1; };
    pool = shuffle(pool).sort((a, b) => prio(a) - prio(b)).slice(0, 10);
    const distract = this.words(vol);
    this.session = {
      vol, mode, from: from || `#/v/${vol}/kata`, i: 0, res: [], flip: false,
      items: shuffle(pool).map(v => ({ v, opts: mode === 'kartu' ? null : this.options(v, distract, codes) })),
    };
    Soal.plays = {};
    App.go('#/latihan');
  },
  // 4 pilihan: pengecoh dari modul yang sama bila cukup, lalu dari volume; arti & hanzi tidak boleh kembar
  options(v, all, codes) {
    const same = shuffle(all.filter(x => x.code === v.code)), rest = shuffle(all.filter(x => x.code !== v.code));
    const out = [v], seenM = new Set([v.meaning]), seenW = new Set([v.w]);
    for (const x of [...same, ...rest]) {
      if (out.length === 4) break;
      if (seenM.has(x.meaning) || seenW.has(x.w)) continue;
      seenM.add(x.meaning); seenW.add(x.w); out.push(x);
    }
    return shuffle(out);
  },

  render() {
    const s = this.session, n = s.items.length;
    App.bar(`${this.MODES[s.mode].name}`, s.from, `<span class="bar-pill">${Math.min(s.i + 1, n)}/${n}</span>`);
    if (s.i >= n) return this.summary();
    const it = s.items[s.i], v = it.v, r = s.res[s.i];
    const prog = `<div class="lprog"><i style="width:${s.i / n * 100}%"></i></div>`;
    let h;
    if (s.mode === 'kartu') {
      h = `<div class="vcard flash ${v.layer}">
          <div class="vcard-top"><span class="layer-chip">${v.code}</span></div>
          <button class="vword" lang="zh-TW" onclick="Speech.word('${esc(v.say || v.w)}')">${esc(v.w)}</button>
          ${s.flip ? `<div class="vpy">${esc(v.py)}</div><div class="vmean"><span class="pos">${esc(v.pos)}</span> ${esc(v.meaning)}</div>`
                   : `<p class="hint">${T('Say this word and recall its meaning first.', 'Ucapkan kata ini dan ingat artinya dulu.')}</p>`}
        </div>
        ${s.flip ? `<div class="row2">
            <button class="btn warn" onclick="Latihan.mark(false)">${Pic.html('🔁', 'ic-sm')} ${T('Not yet', 'Belum ingat')}</button>
            <button class="btn ok" onclick="Latihan.mark(true)">${Pic.html('✅', 'ic-sm')} ${T('Got it', 'Ingat')}</button></div>`
                 : `<button class="btn primary block" onclick="Latihan.flip()">${T('Flip card', 'Balik kartu')}</button>`}`;
    } else {
      const prompt = s.mode === 'dengar'
        ? `<button class="play-big" id="play-lw" onclick="Speech.word('${esc(v.say || v.w)}')">${Pic.html('🔊', 'play-ic')}<span>${T('Listen', 'Dengarkan')}</span><small>${T('tap to play again', 'ketuk untuk memutar lagi')}</small></button>`
        : s.mode === 'hanzi' ? `<div class="vword static" lang="zh-TW">${esc(v.w)}</div>`
        : `<div class="lmean">${esc(v.meaning)}<small>${esc(v.pos)}</small></div>`;
      const lab = x => s.mode === 'arti' ? `<span lang="zh-TW" class="big-zh">${esc(x.w)}</span>` : `<span>${esc(x.meaning)}</span>`;
      h = `<div class="q-card">${prompt}
        <div class="opts">${it.opts.map((x, oi) => {
          const cls = r == null ? '' : x === v ? 'right' : oi === r.pick ? 'wrong' : 'dim';
          return `<button class="opt ${cls}" ${r == null ? `onclick="Latihan.pick(${oi})"` : 'disabled'}><b class="opt-l">${'ABCD'[oi]}</b>${lab(x)}</button>`;
        }).join('')}</div>
        ${r != null ? `<div class="feedback ${r.ok ? 'ok' : 'no'}">${Pic.html(r.ok ? '✅' : '🔁', 'fb-ic')}
            <div><b lang="zh-TW">${esc(v.w)}</b> <span>${esc(v.py)}</span>
              <button class="say-btn" onclick="Speech.word('${esc(v.say || v.w)}')">${Pic.html('🔊', 'ic-xs')}</button>
              <p>${esc(v.meaning)} · <small>${v.code}</small></p></div></div>` : ''}
      </div>
      ${r != null ? `<button class="btn primary block" onclick="Latihan.next()">${s.i + 1 < n ? T('Next ›', 'Berikutnya ›') : T('See results ›', 'Lihat hasil ›')}</button>` : ''}`;
    }
    App.main(prog + h);
    Speech.preload([[v.say || v.w, 'W'], ...(s.items[s.i + 1] ? [[s.items[s.i + 1].v.say || s.items[s.i + 1].v.w, 'W']] : [])]);
    if (s.mode === 'dengar' && r == null && !Soal.plays['lw' + s.i]) { Soal.plays['lw' + s.i] = 1; setTimeout(() => Speech.word(v.say || v.w), 250); }
  },
  record(v, ok) {
    const st = this.stats(), x = st[v.id] || { r: 0, w: 0 };
    ok ? x.r++ : x.w++; x.t = Date.now(); st[v.id] = x;
    Store.set(VSTATS_KEY, st);
  },
  pick(oi) {
    const s = this.session, it = s.items[s.i], ok = it.opts[oi] === it.v;
    s.res[s.i] = { pick: oi, ok };
    this.record(it.v, ok);
    if (s.mode !== 'dengar') Speech.word(it.v.say || it.v.w);
    this.render();
  },
  flip() { const v = this.session.items[this.session.i].v; this.session.flip = true; Speech.word(v.say || v.w); this.render(); },
  mark(ok) { const s = this.session; s.res[s.i] = { ok }; this.record(s.items[s.i].v, ok); this.next(); },
  next() { const s = this.session; s.i++; s.flip = false; this.render(); window.scrollTo(0, 0); },

  summary() {
    const s = this.session, ok = s.res.filter(r => r && r.ok).length, n = s.items.length;
    const wrong = s.items.filter((_, i) => !s.res[i]?.ok);
    const pct = Math.round(ok / n * 100);
    App.main(`
      <div class="result ${pct >= 80 ? 'hi' : pct >= 60 ? 'mid' : 'lo'}">
        ${App.ring(pct, `${ok}/${n}`, 'ring-lg')}
        <p>${pct === 100 ? T('Perfect! You recalled every word from memory.', 'Sempurna! Semua kata terpanggil dari ingatan.') : pct >= 60 ? T('Good. The words you missed have been noted and will come back more often.', 'Bagus. Kata yang salah sudah dicatat dan akan muncul lagi lebih sering.') : T('That is fine — the effort of recalling is exactly what strengthens memory. Go over the missed words now.', 'Tidak apa-apa — justru usaha mengingat inilah yang memperkuat ingatan. Ulangi kata yang salah sekarang.')}</p>
      </div>
      ${wrong.length ? `<h3 class="sub-title">${T('To review', 'Perlu diulang')}</h3>
        <div class="wlist">${wrong.map(({ v }) => `<button class="wrow" onclick="Speech.word('${esc(v.say || v.w)}')">
          <b lang="zh-TW">${esc(v.w)}</b><span>${esc(v.py)}</span><small>${esc(v.meaning)}</small>${Pic.html('🔊', 'ic-xs')}</button>`).join('')}</div>` : ''}
      <div class="row2">
        ${wrong.length ? `<button class="btn primary" onclick="Latihan.again(true)">${T('Retry the missed ones', 'Ulangi yang salah')}</button>` : ''}
        <button class="btn ghost" onclick="Latihan.again(false)">${T('New session', 'Sesi baru')}</button>
      </div>
      <button class="btn ghost block" onclick="App.go('${s.from}')">${T('Done', 'Selesai')}</button>`);
  },
  again(wrongOnly) {
    const s = this.session;
    const list = wrongOnly ? s.items.filter((_, i) => !s.res[i]?.ok).map(x => x.v) : null;
    const codes = [...new Set(s.items.map(x => x.v.code))];
    this.start({ vol: s.vol, mode: s.mode, from: s.from, list, codes: list ? null : (s.from.startsWith('#/m/') ? codes : null) });
  },
};

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
