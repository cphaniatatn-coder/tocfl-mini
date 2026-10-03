/* TOCFL Band A — app belajar mandiri (SDL), mobile-first.
   Rute (hash, supaya tombol Kembali di HP bekerja):
     #/                 beranda
     #/v/1              peta modul volume 1   (#/v/1/kata = latihan kosakata, #/v/1/ujian = ujian simulasi)
     #/m/A01/0          modul A01, tahap ke-0
     #/latihan          sesi latihan kosakata yang sedang berjalan
     #/ujian            sesi ujian simulasi yang sedang berjalan
     #/kirim            kirim hasil ke Google Sheet guru (js/kirim.js) */

const VOLUMES = [
  { num: 1, level: 'A0', tbcl: 'TBCL 第1級', vocab: 396, grammar: 15, approach: T('TBLL · 6 stages', 'TBLL 6 tahap'), color: 'v1' },
  { num: 2, level: 'A1', tbcl: 'TBCL 第2級', vocab: 402, grammar: 92, approach: T('TBLL · 6 stages', 'TBLL 6 tahap'), color: 'v2' },
  { num: 3, level: 'A2', tbcl: 'TBCL 第3級', vocab: 456, grammar: 134, approach: T('TBLL · 6 stages', 'TBLL 6 tahap'), color: 'v3' },
];
const STORAGE_KEY = 'tocflmini_modul_progress';

const Store = {
  get(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* mode privat */ } },
};

const App = {
  plan: null, volData: {}, bank: {},

  // Data dimuat per bagian (bukan semuanya di awal) supaya app cepat terbuka:
  // rencana.json (kecil) langsung; isi volume & bank soal baru saat dibutuhkan.
  _load: {},
  async init() {
    try {
      this.plan = await (await fetch(Lang.DATA + 'rencana.json')).json();
    } catch {
      this.main(`<div class="empty"><p>${T('Could not load the data. Run the app from a local server, e.g.', 'Gagal memuat data. Jalankan app lewat server lokal, mis.')} <code>py -m http.server</code>.</p></div>`);
      return;
    }
    window.addEventListener('hashchange', () => this.route());
    this.route();
    // setelah layar pertama tampil, muat sisanya diam-diam
    setTimeout(() => { VOLUMES.forEach(v => this.need(v.num)); this.needBank(); }, 1500);
  },
  need(vol) {
    if (this.volData[vol]) return Promise.resolve();
    return this._load[vol] ||= fetch(`${Lang.DATA}modul_vol${vol}.json`).then(r => r.json()).then(d => { this.volData[vol] = d; })
      .catch(() => { delete this._load[vol]; throw new Error('gagal'); });
  },
  // Bank soal Tes Bab (opsional: app tetap jalan tanpa file ini)
  needBank() {
    return this._load.bank ||= fetch(Lang.DATA + 'bank_soal.json').then(r => r.json()).then(d => { this.bank = d; }).catch(() => {});
  },
  volOf(code) { return VOLUMES.find(v => this.plan[v.num].some(m => m.code === code))?.num; },

  go(hash) { if (location.hash === hash) this.route(); else location.hash = hash; },

  async route() {
    Speech.stop();
    const hash = location.hash;
    const p = (hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
    if (p.length === 1 && Lang.is(decodeURIComponent(p[0]))) return Lang.toggle();   // kode rahasia bahasa (js/lang.js)
    // tunggu data yang dibutuhkan halaman ini saja
    const butuh = [];
    if (p[0] === 'v' && p[2]) { butuh.push(this.need(+p[1])); if (p[2] === 'ujian') butuh.push(this.needBank()); }
    if (p[0] === 'm' && this.volOf(p[1])) { butuh.push(this.need(this.volOf(p[1]))); if (+p[2] === 5) butuh.push(this.needBank()); else this.needBank(); }
    if (butuh.length) {
      const t = setTimeout(() => this.main(`<div class="empty"><p>${T('Loading…', 'Memuat…')}</p></div>`), 150);
      try { await Promise.all(butuh); } catch { clearTimeout(t); this.main(`<div class="empty"><p>${T('Could not load the data. Check your connection, then reload.', 'Gagal memuat data. Periksa koneksi, lalu muat ulang.')}</p></div>`); return; }
      clearTimeout(t);
      if (location.hash !== hash) return;       // pengguna sudah pindah halaman
    }
    if (p[0] === 'v' && VOLUMES.some(v => v.num === +p[1])) return this.renderVolume(+p[1], p[2] || 'modul');
    if (p[0] === 'm' && this.findModule(p[1])) return Modul.open(p[1], +(p[2] || 0));
    if (p[0] === 'latihan' && Latihan.session) return Latihan.render();
    if (p[0] === 'ujian' && Ujian.session) return Ujian.render();
    if (p[0] === 'kirim') return Kirim.render();
    return this.renderHome();
  },

  /* ===== util ===== */
  main(html) { document.getElementById('app-main').innerHTML = html; window.scrollTo(0, 0); },
  bar(title, back, extra = '') {
    document.getElementById('app-bar').innerHTML = `
      ${back ? `<button class="bar-back" onclick="App.go('${back}')" aria-label="${T('Back', 'Kembali')}">‹</button>` : `<span class="bar-logo">華</span>`}
      <div class="bar-title">${title}</div>
      <div class="bar-extra">${extra}</div>`;
  },
  findModule(code) {
    for (const v of VOLUMES) {
      const m = (this.volData[v.num]?.modules || []).find(x => x.code === code);
      if (m) return { vol: v.num, m };
    }
    return null;
  },
  getP(code) { return Store.get(STORAGE_KEY, {})[code] || {}; },
  setP(code, patch) {
    const all = Store.get(STORAGE_KEY, {});
    all[code] = Object.assign(all[code] || {}, patch);
    Store.set(STORAGE_KEY, all);
  },
  status(code) {
    const p = this.getP(code);
    return p.done ? 'done' : (p.goal || p.stage || p.tasks) ? 'progress' : 'new';
  },
  volStats(vol) {
    const mods = this.plan[vol];
    const done = mods.filter(m => this.status(m.code) === 'done').length;
    const scores = mods.map(m => this.getP(m.code).tasks?.best).filter(s => s != null);
    return { done, total: mods.length, pct: Math.round(done / mods.length * 100),
             avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
  },
  ring(pct, label, cls = '') {
    return `<div class="ring ${cls}" style="--p:${pct}"><span>${label}</span></div>`;
  },
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show';
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 2400);
  },

  /* ===== BERANDA ===== */
  renderHome() {
    this.bar('TOCFL Band A', null);
    const last = Store.get('tocflmini_last', null);
    const lastV = last && this.volOf(last.code);
    const lastM = lastV && { m: this.plan[lastV].find(m => m.code === last.code) };
    const allDone = Object.values(Store.get(STORAGE_KEY, {})).filter(p => p.done).length;
    this.main(`
      <section class="hero">
        <div>
          <h1>華語文能力測驗</h1>
          <p>${T('Learn scene by scene, practise TOCFL-style questions, and track your own progress.', 'Belajar per adegan, latihan gaya TOCFL, dan pantau kemajuanmu sendiri.')}</p>
        </div>
        ${this.ring(Math.round(allDone / 138 * 100), `${allDone}<small>/138</small>`, 'ring-lg')}
      </section>
      ${lastM ? `
      <button class="card continue" onclick="App.go('#/m/${lastM.m.code}/${last.stage || 0}')">
        ${Pic.scene(lastM.m.categories[0], 'sm')}
        <div class="continue-txt">
          <small>${T('Continue learning', 'Lanjutkan belajar')}</small>
          <b lang="zh-TW">${esc(lastM.m.title)}</b>
          <span>${lastM.m.code} · ${T(`stage ${(last.stage || 0) + 1} of 6`, `tahap ${(last.stage || 0) + 1} dari 6`)}</span>
        </div>
        <span class="chev">›</span>
      </button>` : ''}
      <h2 class="section-title">${T('Choose a volume', 'Pilih volume')}</h2>
      <div class="vol-list">
        ${VOLUMES.map(v => {
          const s = this.volStats(v.num);
          return `<button class="card vol-card ${v.color}" onclick="App.go('#/v/${v.num}')">
            <div class="vol-badge">${v.level}</div>
            <div class="vol-info">
              <b>Volume ${v.num}</b>
              <span>${v.tbcl} · ${s.total} ${T('modules', 'modul')} · ${v.vocab} ${T('words', 'kata')} · ${v.grammar} ${T('grammar points', 'grammar')}</span>
              <div class="bar"><i style="width:${s.pct}%"></i></div>
              <small>${s.done}/${s.total} ${T('done', 'selesai')}${s.avg != null ? ` · ${T('task average', 'rata-rata tugas')} ${s.avg}%` : ''}</small>
            </div>
            <span class="chev">›</span>
          </button>`;
        }).join('')}
      </div>
      ${Kirim.aktif() ? `
      <button class="card continue" onclick="App.go('#/kirim')">
        ${Pic.html('📤', 'mode-ic')}
        <div class="continue-txt"><small>${T('For your teacher', 'Untuk guru')}</small><b>${T('Send my results', 'Kirim hasil belajar')}</b><span>${T('Your scores & reflections go to your teacher', 'Nilai & refleksimu dikirim ke gurumu')}</span></div>
        <span class="chev">›</span>
      </button>` : ''}
      <p class="credit">${T('Illustrations: Twemoji © Twitter/X &amp; contributors, licensed CC-BY 4.0. Black-and-white question images: OpenMoji (openmoji.org), licensed CC BY-SA 4.0.', 'Ilustrasi: Twemoji © Twitter/X &amp; kontributor, lisensi CC-BY 4.0. Gambar soal hitam-putih: OpenMoji (openmoji.org), lisensi CC BY-SA 4.0.')}</p>`);
  },

  /* ===== VOLUME: tab Modul / Kosakata / Ujian ===== */
  renderVolume(vol, tab) {
    const v = VOLUMES.find(x => x.num === vol);
    const s = this.volStats(vol);
    this.bar(`Volume ${vol} · ${v.level}`, '#/');
    const tabs = [['modul', T('Modules', 'Modul')], ['kata', T('Vocabulary', 'Kosakata')], ['ujian', T('Mock exam', 'Ujian simulasi')]];
    const body = tab === 'kata' ? Latihan.menu(vol) : tab === 'ujian' ? Ujian.menu(vol) : this.moduleList(vol);
    this.main(`
      <section class="vol-head ${v.color}">
        ${this.ring(s.pct, `${s.pct}%`)}
        <div><b>${v.tbcl}</b><span>${v.approach} · ${s.done}/${s.total} ${T('modules done', 'modul selesai')}</span></div>
      </section>
      <nav class="tabs" role="tablist">
        ${tabs.map(([k, l]) => `<button role="tab" class="${k === tab ? 'on' : ''}" onclick="App.go('#/v/${vol}${k === 'modul' ? '' : '/' + k}')">${l}</button>`).join('')}
      </nav>
      ${body}`);
  },

  moduleList(vol) {
    // Kelompokkan per kategori situasi (urutan tetap mengikuti urutan belajar)
    const groups = [];
    for (const m of this.plan[vol]) {
      const cat = m.categories[0];
      if (!groups.length || groups[groups.length - 1].cat !== cat) groups.push({ cat, mods: [] });
      groups[groups.length - 1].mods.push(m);
    }
    return groups.map(g => `
      <div class="cat-group">
        <div class="cat-head">${Pic.html(Pic.SCENE[Pic.catNum(g.cat)][0], 'cat-ic')}<span lang="zh-TW">${esc(g.cat)}</span></div>
        ${g.mods.map(m => {
          const st = this.status(m.code), p = this.getP(m.code), best = p.tes?.best ?? p.tasks?.best;
          return `<button class="mod-row st-${st}" onclick="App.go('#/m/${m.code}/${this.getP(m.code).stage || 0}')">
            <span class="mod-code">${m.code}</span>
            <span class="mod-main"><b lang="zh-TW">${esc(m.title)}</b><small>${esc(m.scene)}</small></span>
            <span class="mod-state">${st === 'done' ? '✓' : st === 'progress' ? (best != null ? best + '%' : '•') : ''}</span>
          </button>`;
        }).join('')}
      </div>`).join('');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
