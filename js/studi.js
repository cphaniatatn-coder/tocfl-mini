/* Alur uji coba modul mini (thesis Carli): pilih bahasa → data diri & level → kuesioner kecemasan + tes awal
   → 6 bab level itu → kuesioner kecemasan + tes akhir + evaluasi modul → hasil terkirim ke Google Sheet.
   Dimuat SETELAH app.js/modul.js/ujian.js dan menimpa beberapa fungsinya (beranda, rute, akhir modul, hasil tes).
   Sumber: _kerja/mini/web/ di repo utama; disalin ke repo mini oleh _kerja/buat_mini.py. */

const STUDI_KEY = 'tocflmini_studi';
const LEVEL_VOL = { A0: 1, A1: 2, A2: 3 };
const KIRIM_URL = "https://script.google.com/macros/s/AKfycbx4A9rCclMGfm-uC5d2gPFevIlN8ywZZIQevwoYR79bvyqDK7i9kc3eKQZY4Ux4lxrb/exec";   // ← diisi lewat _kerja/mini/config.json (kirim_url) saat buat_mini.py dijalankan

const Studi = {
  data: null,
  get() { return Store.get(STUDI_KEY, {}); },
  set(patch) { const s = Object.assign(this.get(), patch); Store.set(STUDI_KEY, s); return s; },
  fase(f, patch) { const s = this.get(); return this.set({ [f]: Object.assign(s[f] || {}, patch) }); },
  async load() {
    if (!this.data) this.data = await (await fetch(Lang.DATA + 'studi.json')).json();
    return this.data;
  },
  uid() {
    const s = this.get();
    if (s.uid) return s.uid;
    const uid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 10);
    this.set({ uid });
    return uid;
  },
  /* Putaran: peserta yang selesai & hasilnya terkirim boleh lanjut ke level di atasnya (A0 → A1 → A2).
     Putaran 1 = data utama tesis. Putaran ≥ 2 dikirim dengan kode peserta + "-P2", "-P3"… sehingga
     menjadi baris terpisah di Sheet (putaran 1 tidak tertimpa) dan mudah dipisahkan saat analisis. */
  putaran() { return this.get().putaran || 1; },
  kode() { const n = this.putaran(); return n > 1 ? `${this.uid()}-P${n}` : this.uid(); },
  levelBerikut() { return { A0: 'A1', A1: 'A2' }[this.get().level] || null; },
  bisaLanjut() {
    const s = this.get();
    return !!this.levelBerikut() && this.langkah() === 7 && (this.admin() || (!!s.terkirim && s.terkirim >= (s.selesai || 0)));
  },
  lanjutLevel() {
    const s = this.get(), next = this.levelBerikut();
    if (!this.bisaLanjut()) return;
    if (!confirm(T(`Start level ${next}? You will do a new pre-test, 6 units, post-test and questionnaires for ${next}. Your ${s.level} results are already saved and sent.`,
                   `Mulai level ${next}? Kamu akan mengerjakan tes awal, 6 bab, tes akhir, dan kuesioner yang baru untuk ${next}. Hasil ${s.level} sudah tersimpan dan terkirim.`))) return;
    const arsip = (s.arsip || []).concat([{ putaran: this.putaran(), kode: this.kode(), level: s.level, mulai: s.mulai, selesai: s.selesai, terkirim: s.terkirim, pre: s.pre, post: s.post }]);
    this.set({ arsip, putaran: this.putaran() + 1, level: next, pre: null, post: null, selesai: null, terkirim: null, gagalKirim: false, mulai: Date.now() });
    App.go('#/'); this.renderHome();
  },
  lanjutHTML() {
    if (!this.bisaLanjut()) return '';
    const s = this.get(), next = this.levelBerikut();
    return `<button class="card continue lanjut-lv" onclick="Studi.lanjutLevel()">${Pic.html('📈', 'mode-ic')}
      <div class="continue-txt"><small>${T('Optional', 'Pilihan tambahan')}</small><b>${T(`Continue to level ${next}`, `Lanjut ke level ${next}`)}</b>
      <span>${T(`You have finished ${s.level}. Want to go on? New pre-test, 6 units of ${next} and post-test.`, `Kamu sudah menyelesaikan ${s.level}. Mau lanjut? Tes awal baru, 6 bab ${next}, lalu tes akhir.`)}</span></div><span class="chev">›</span></button>`;
  },
  vol() { return LEVEL_VOL[this.get().level]; },
  mods() { return this.vol() ? App.plan[this.vol()] : []; },
  nDone() { return this.mods().filter(m => App.getP(m.code).done).length; },
  // Mode admin (ketik nama "admin" di Data diri): semua langkah terbuka, data tidak dikirim
  admin() { const s = this.get(); return !!s.admin || (s.profil?.nama || '').toLowerCase() === 'admin'; },
  masukAdmin(p = {}) {
    const lv = this.levelAwal(p);
    Store.set(STUDI_KEY, { admin: true, profil: { nama: 'admin', pernah: p.pernah ?? 0 }, level: lv && lv !== 'lewat' ? lv : 'A0', mulai: Date.now(), lang: LANG });
    App.go('#/'); this.renderHome();
  },
  keluarAdmin() {
    if (!confirm(T('Leave admin mode? All admin answers and unit progress on this device will be deleted.', 'Keluar dari mode admin? Semua jawaban admin dan progres bab di perangkat ini akan dihapus.'))) return;
    Store.set(STUDI_KEY, {}); Store.set(STORAGE_KEY, {});
    this.renderHome();
  },
  adminSet(k, v) {
    if (k === 'level') this.set({ level: v });
    else this.set({ profil: Object.assign({}, this.get().profil, { pernah: v }) });
    this.renderHome();
  },
  adminHapus() {
    if (!confirm(T('Delete the admin answers (questionnaires, tests, evaluation)?', 'Hapus jawaban admin (kuesioner, tes, evaluasi)?'))) return;
    this.set({ pre: null, post: null, selesai: null });
    this.renderHome();
  },
  adminPanel() {
    const s = this.get(), seg = (k, cur, opts) => `<div class="seg wrap">${opts.map(([v, l]) =>
      `<button class="${cur === v ? 'on' : ''}" onclick="Studi.adminSet('${k}', ${typeof v === 'string' ? `'${v}'` : v})">${l}</button>`).join('')}</div>`;
    return `<div class="panel admin-panel"><div class="panel-k">${Pic.html('🔧', 'ic-sm')} ${T('Admin mode', 'Mode admin')}</div>
      <p class="hint">${T('Every step is open in any order. Nothing is sent to the researcher.', 'Semua langkah terbuka, urutan bebas. Tidak ada data yang dikirim ke peneliti.')}</p>
      <div class="field-k">${T('Level', 'Level')}</div>${seg('level', s.level, [['A0', 'A0'], ['A1', 'A1'], ['A2', 'A2']])}
      <div class="field-k">${T('Questionnaire version', 'Versi kuesioner')}</div>${seg('pernah', s.profil?.pernah, [[0, T('Has taken TOCFL', 'Pernah ikut TOCFL')], [1, T('Never taken TOCFL', 'Belum pernah')]])}
      <div class="admin-act"><button class="btn" onclick="Studi.adminHapus()">${T('Clear answers', 'Hapus jawaban')}</button>
        <button class="btn" onclick="Studi.keluarAdmin()">${T('Leave admin mode', 'Keluar admin')}</button></div></div>`;
  },

  /* Langkah: 0 data diri · 1 kuesioner awal · 2 tes awal · 3 modul · 4 kuesioner akhir · 5 tes akhir · 6 evaluasi · 7 selesai */
  langkah() {
    const s = this.get();
    if (!s.profil) return 0;
    if (this.admin() && !s.pre?.tes) return 3;
    if (!s.pre?.cemas) return 1;
    if (!s.pre?.tes) return 2;
    if (this.nDone() < this.mods().length) return 3;
    if (!s.post?.cemas) return 4;
    if (!s.post?.tes) return 5;
    if (!s.post?.eval) return 6;
    return 7;
  },

  /* ===== Pilih bahasa (layar pertama) ===== */
  renderBahasa() {
    document.getElementById('app-bar').innerHTML = '<span class="bar-logo">華</span><div class="bar-title">TOCFL Band A</div><div class="bar-extra"></div>';
    App.main(`
      <section class="hero"><div><h1>華語文能力測驗</h1><p>Choose your language · Pilih bahasa · Chọn ngôn ngữ</p></div></section>
      <div class="mode-list">
        ${[['id', 'Bahasa Indonesia', '🇮🇩'], ['en', 'English', '🇬🇧'], ['vi', 'Tiếng Việt', '🇻🇳']].map(([k, l, f]) => `
        <button class="card mode-card" onclick="Lang.pilih('${k}')">${Pic.html(f, 'mode-ic')}<div><b>${l}</b></div><span class="chev">›</span></button>`).join('')}
      </div>`);
  },

  /* ===== Beranda: daftar langkah ===== */
  async renderHome() {
    await this.load();
    const s = this.get(), L = this.langkah(), mods = this.mods(), adm = this.admin();
    App.bar('TOCFL Band A', null, `<button class="bar-pill" onclick="Lang.ganti()">${{ id: 'ID', en: 'EN', vi: 'VI' }[LANG]}</button>`);
    const selesai = [!!s.profil, !!s.pre?.cemas, !!s.pre?.tes, false, !!s.post?.cemas, !!s.post?.tes, !!s.post?.eval];
    const row = (i, ic, judul, sub, href) => {
      const st = adm ? (selesai[i] ? 'done' : 'cur') : L > i ? 'done' : L === i ? 'cur' : 'lock';
      return `<button class="card mode-card step-card st-${st}" ${st === 'lock' ? 'disabled' : `onclick="App.go('${href}')"`}>
        ${Pic.html(st === 'done' ? '✅' : st === 'lock' ? '🔒' : ic, 'mode-ic')}
        <div><b>${judul}</b><span>${sub}</span></div>${st === 'lock' ? '' : '<span class="chev">›</span>'}</button>`;
    };
    const modRows = mods.map(m => {
      const p = App.getP(m.code), st = p.done ? 'done' : L >= 3 || adm ? 'cur' : 'lock';
      return `<button class="mod-row st-${p.done ? 'done' : (p.stage || p.tasks) ? 'progress' : 'new'}" ${st === 'lock' ? 'disabled' : `onclick="App.go('#/m/${m.code}/${p.stage || 0}')"`}>
        <span class="mod-code">${m.code}</span>
        <span class="mod-main"><b lang="zh-TW">${esc(m.title)}</b><small>${esc(m.scene)}</small></span>
        <span class="mod-state">${p.done ? '✓' : st === 'lock' ? '🔒' : p.tes?.best != null ? p.tes.best + '%' : ''}</span></button>`;
    }).join('');
    App.main(`
      <section class="hero">
        <div><h1>華語文能力測驗</h1>
          <p>${s.level ? T(`Trial module · level ${s.level} · 6 units`, `Modul uji coba · level ${s.level} · 6 bab`) + (this.putaran() > 1 ? ` · ${T('round', 'putaran')} ${this.putaran()}` : '') : T('Trial module for TOCFL Band A preparation.', 'Modul uji coba persiapan TOCFL Band A.')}</p></div>
        ${App.ring(Math.round(Math.min(L, 7) / 7 * 100), `${Math.min(L, 7)}<small>/7</small>`, 'ring-lg')}
      </section>
      ${adm ? this.adminPanel() : ''}
      ${!s.profil ? `<button class="card mode-card ptj-kartu" onclick="Studi.bukaPetunjuk()">${Pic.html('❓', 'mode-ic')}
        <div><b>${T('Read the instructions first', 'Baca petunjuk dulu')}</b><span>${T('1 minute · how the trial works and the rules for the tests', '1 menit · cara kerja uji coba dan aturan tes')}</span></div><span class="chev">›</span></button>` : ''}
      <div class="mode-list">
        ${row(0, '🪪', T('1 · About you & your level', '1 · Data diri & level'), s.profil ? `${esc(s.profil.nama)} · ${s.level}` : T('± 3 min', '± 3 menit'), '#/studi/profil')}
        ${row(1, '📋', T('2 · Questionnaire (before)', '2 · Kuesioner (awal)'), T('20 statements about exam anxiety · ± 5 min', '20 pernyataan tentang kecemasan ujian · ± 5 menit'), '#/studi/skala/pre')}
        ${row(2, '📝', T('3 · Pre-test', '3 · Tes awal'), s.pre?.tes ? `${s.pre.tes.skor}%` : T('20 TOCFL-style questions · 30 min', '20 soal gaya TOCFL · 30 menit'), '#/studi/tes/pre')}
      </div>
      <h2 class="section-title">${T('4 · Learn the 6 units', '4 · Pelajari 6 bab')} <small>${this.nDone()}/${mods.length}</small></h2>
      ${L < 3 ? `<p class="hint">${T('The units open after the pre-test.', 'Bab terbuka setelah tes awal.')}</p>` : `<p class="hint">${T('Finish all six stages of each unit, including the tasks. The unit test is in the last stage.', 'Selesaikan keenam tahap tiap bab, termasuk tugas. Tes Bab ada di tahap terakhir.')}</p>`}
      <div class="cat-group">${modRows}</div>
      <div class="mode-list" style="margin-top:14px">
        ${row(4, '📋', T('5 · Questionnaire (after)', '5 · Kuesioner (akhir)'), T('The same 20 statements · ± 5 min', '20 pernyataan yang sama · ± 5 menit'), '#/studi/skala/post')}
        ${row(5, '🎓', T('6 · Post-test', '6 · Tes akhir'), s.post?.tes ? `${s.post.tes.skor}%` : T('20 TOCFL-style questions · 30 min', '20 soal gaya TOCFL · 30 menit'), '#/studi/tes/post')}
        ${row(6, '💬', T('7 · Your opinion of the module', '7 · Pendapatmu tentang modul'), T('10 statements + 3 short questions', '10 pernyataan + 3 pertanyaan singkat'), '#/studi/eval')}
      </div>
      ${L >= 1 ? `<button class="card continue" onclick="App.go('#/kirim')">${Pic.html('📤', 'mode-ic')}
        <div class="continue-txt"><small>${T('Results', 'Hasil')}</small><b>${L === 7 ? T('Finished — thank you!', 'Selesai — terima kasih!') : T('Sending status', 'Status pengiriman')}</b>
        <span>${s.terkirim ? `${T('Last sent', 'Terakhir terkirim')}: ${new Date(s.terkirim).toLocaleString(Lang.LOCALE)}` : T('Not sent yet', 'Belum terkirim')}</span></div><span class="chev">›</span></button>` : ''}
      ${this.lanjutHTML()}
      <p class="credit">${T('Illustrations: Twemoji © Twitter/X &amp; contributors, licensed CC-BY 4.0. Black-and-white question images: OpenMoji (openmoji.org), licensed CC BY-SA 4.0.', 'Ilustrasi: Twemoji © Twitter/X &amp; kontributor, lisensi CC-BY 4.0. Gambar soal hitam-putih: OpenMoji (openmoji.org), lisensi CC BY-SA 4.0.')}</p>`);
  },

  /* ===== 1. Data diri & level ===== */
  PILIHAN: () => ({
    usia: ['15–18', '19–25', '26–35', '> 35'],
    negara: [T('Indonesia', 'Indonesia'), T('Vietnam', 'Vietnam'), T('Other', 'Lainnya')],
    mandarin: ['A0', 'A1', 'A2'],   // modul hanya sampai A2
    pernah: [T('Yes', 'Ya'), T('No', 'Tidak')],
    lulus: [T('Not passed yet / Novice (準備級)', 'Belum lulus / Novice (準備級)'), 'A1 · 入門級', T('A2 · 基礎級 or higher', 'A2 · 基礎級 atau lebih tinggi')],
    lama: [T('< 6 months', '< 6 bulan'), T('6–12 months', '6–12 bulan'), T('1–2 years', '1–2 tahun'), T('> 2 years', '> 2 tahun')],
    rencana: [T('Within 3 months', '≤ 3 bulan lagi'), T('In 3–6 months', '3–6 bulan lagi'), T('In more than 6 months', '> 6 bulan lagi'), T('Not sure yet', 'Belum tahu')],
  }),
  renderProfil() {
    const s = this.get(), p = s.profilDraf || s.profil || {}, P = this.PILIHAN(), Q = this.data.kuesioner, lv = this.levelAwal(p);
    if (s.pre?.cemas || this.putaran() > 1) return App.go('#/');   // data diri & level dikunci setelah kuesioner awal / di putaran lanjutan
    App.bar(T('About you', 'Data diri'), '#/');
    const radio = (k, opts, judul) => `<div class="field-k">${judul}</div>
      <div class="seg wrap" role="radiogroup">${opts.map((o, i) => `<button class="${p[k] === i ? 'on' : ''}" onclick="Studi.pf('${k}', ${i})">${esc(o)}</button>`).join('')}</div>`;
    App.main(`
      <div class="panel"><div class="panel-k">${Pic.html('🔒', 'ic-sm')} ${T('About this trial', 'Tentang uji coba ini')}</div>
        <p>${T('This module is part of a thesis study on how learning materials can reduce TOCFL exam anxiety. You will fill in a questionnaire and a short test before and after studying 6 units. Your answers are only used for research; your name is not published.',
              'Modul ini bagian dari penelitian thesis tentang bagaimana bahan ajar dapat mengurangi kecemasan menghadapi ujian TOCFL. Kamu akan mengisi kuesioner dan tes singkat sebelum dan sesudah mempelajari 6 bab. Jawabanmu hanya dipakai untuk penelitian; namamu tidak dipublikasikan.')}</p></div>
      <label class="field-k" for="p-nama">${T('Name or initials', 'Nama atau inisial')}</label>
      <input id="p-nama" class="field" maxlength="60" value="${esc(p.nama || '')}" oninput="Studi.pf('nama', this.value, true)">
      <label class="field-k" for="p-email">${T('Active email address', 'Email aktif')}</label>
      <input id="p-email" class="field" type="email" inputmode="email" autocomplete="email" maxlength="100" value="${esc(p.email || '')}" oninput="Studi.pf('email', this.value, true)">
      <p class="hint">${T('Only used by the researcher to contact you, e.g. if you have not finished the trial yet. It is never published.', 'Hanya dipakai peneliti untuk menghubungimu, misalnya jika uji coba belum selesai. Tidak dipublikasikan.')}</p>
      ${radio('usia', P.usia, T('Age', 'Usia'))}
      ${radio('negara', P.negara, T('Nationality', 'Kewarganegaraan'))}
      ${radio('mandarin', P.mandarin, T('Your current Chinese level (self-assessment)', 'Kemampuan Mandarin saat ini (penilaian diri)'))}
      ${radio('pernah', P.pernah, T('Have you ever taken a Chinese proficiency test (TOCFL)?', 'Pernah mengikuti ujian kemampuan Mandarin (TOCFL)?'))}
      ${p.pernah === 0 ? radio('lulus', P.lulus, T('Highest TOCFL level you have passed', 'Level TOCFL tertinggi yang sudah kamu lulus')) : ''}
      ${radio('lama', P.lama, T('How long have you studied Chinese?', 'Sudah berapa lama belajar Mandarin?'))}
      ${radio('rencana', P.rencana, T('When do you plan to take the TOCFL?', 'Kapan rencana mengikuti TOCFL?'))}
      <div class="field-k">${T('Your starting level in this trial', 'Level awalmu di uji coba ini')}</div>
      ${lv === 'lewat' ? `<div class="panel"><p>${T('You have already passed A2 or higher. This trial module only covers levels A0–A2, so it is not meant for you. Thank you for your interest! 謝謝！', 'Kamu sudah lulus A2 atau lebih tinggi. Modul uji coba ini hanya mencakup level A0–A2, jadi tidak ditujukan untukmu. Terima kasih atas minatmu! 謝謝！')}</p></div>`
        : lv ? `<div class="mode-list"><div class="card mode-card lv-card on"><b class="lv-badge">${lv}</b><div><span>${esc(Q.level[lv])}</span></div><b class="lv-cek">✓</b></div></div>`
        : `<p class="hint">${T('Answer the questions above first.', 'Jawab pertanyaan di atas dulu.')}</p>`}
      <p class="hint">${T('The level is set automatically: if you passed TOCFL A1, you start at A2; otherwise you start at the level of your self-assessment. After finishing, you may continue to the next level (up to A2). The level cannot be changed after the first questionnaire.',
                          'Level ditentukan otomatis: jika sudah lulus TOCFL A1, kamu langsung mulai di A2; jika belum, kamu mulai dari level penilaian dirimu. Setelah selesai, kamu boleh lanjut ke level berikutnya (sampai A2). Level tidak bisa diganti setelah kuesioner awal.')}</p>
      <div class="checks"><label><input type="checkbox" id="p-setuju" ${p.setuju ? 'checked' : ''} onchange="Studi.pf('setuju', this.checked, true)">
        ${T('I agree to take part, and that my answers, scores, progress and email address are sent to the researcher.', 'Saya bersedia ikut, dan setuju jawaban, nilai, progres, serta email saya di app ini dikirim ke peneliti.')}</label></div>
      <button class="btn primary block" onclick="Studi.simpanProfil()">${T('Save and continue', 'Simpan dan lanjut')} ›</button>`);
  },
  /* Aturan level awal (peneliti): sudah lulus TOCFL A1 → langsung A2; lulus A2 ke atas → bukan sasaran modul;
     belum pernah / belum lulus A1 → mulai dari penilaian diri (mandarin: 0 A0 · 1 A1 · 2 A2), lalu boleh lanjut naik. */
  levelAwal(p) {
    if (p.pernah === 0 && p.lulus === 2) return 'lewat';
    if (p.pernah === 0 && p.lulus === 1) return 'A2';
    if (p.pernah == null || (p.pernah === 0 && p.lulus == null) || p.mandarin == null) return null;
    return this.PILIHAN().mandarin[p.mandarin];
  },
  pf(k, v, diam) {
    const s = this.get();
    this.set({ profilDraf: Object.assign({}, s.profilDraf || s.profil || {}, { [k]: v }) });
    if (!diam) { const y = window.scrollY; this.renderProfil(); window.scrollTo(0, y); }
  },
  simpanProfil() {
    const p = Object.assign({}, this.get().profilDraf || this.get().profil || {});
    p.nama = (document.getElementById('p-nama').value || '').trim();
    if (p.pernah !== 0) delete p.lulus;
    const kurang = ['usia', 'negara', 'mandarin', 'pernah', 'lama', 'rencana', ...(p.pernah === 0 ? ['lulus'] : [])].filter(k => p[k] == null);
    if (!p.nama) return App.toast(T('Enter your name or initials.', 'Isi nama atau inisialmu.'));
    if (p.nama.toLowerCase() === 'admin') return this.masukAdmin(p);   // nama "admin" → langsung mode admin
    p.email = (document.getElementById('p-email').value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return App.toast(T('Enter a valid email address.', 'Isi alamat email yang benar.'));
    if (kurang.length) return App.toast(T('Please answer all the questions.', 'Jawab semua pertanyaan dulu.'));
    p.level = this.levelAwal(p);
    if (p.level === 'lewat') return App.toast(T('This trial only covers A0–A2.', 'Uji coba ini hanya untuk A0–A2.'));
    if (!p.level) return App.toast(T('Answer all the questions.', 'Jawab semua pertanyaan dulu.'));
    if (!p.setuju) return App.toast(T('Tick the consent box first.', 'Centang persetujuan dulu.'));
    this.set({ profil: p, profilDraf: null, level: p.level, mulai: this.get().mulai || Date.now(), lang: LANG });
    this.uid();
    App.go('#/');
  },

  /* ===== Kuesioner kecemasan (pre & post sama persis) ===== */
  belumPernah() { return this.get().profil?.pernah === 1; },   // PILIHAN.pernah: 0 Ya · 1 Tidak
  butirCemas() { const b = this.belumPernah(); return this.data.kuesioner.cemas.flatMap(d => d.items.map(x => b && x.tb || x.t)); },
  renderSkala(f) {
    const s = this.get();
    if (!this.admin() && ((f === 'pre' && this.langkah() !== 1) || (f === 'post' && this.langkah() !== 4))) return App.go('#/');
    App.bar(f === 'pre' ? T('Questionnaire (before)', 'Kuesioner (awal)') : T('Questionnaire (after)', 'Kuesioner (akhir)'), '#/');
    const items = this.butirCemas(), jw = (s[f] || {}).cemasDraf || [];
    this.renderLikert(items, jw, `Studi.likert('${f}', 'cemasDraf', %i, %v)`,
      `<p>${T('Read each statement and choose how much you agree. There are no right or wrong answers — answer honestly about how you feel about the TOCFL exam.', 'Baca tiap pernyataan, lalu pilih seberapa setuju kamu. Tidak ada jawaban benar atau salah — jawablah sejujurnya tentang perasaanmu terhadap ujian TOCFL.')}</p>
      ${this.belumPernah() ? `<p><b>${esc(this.data.kuesioner.petunjukBaru)}</b></p>` : ''}`,
      `Studi.simpanSkala('${f}')`);
  },
  renderLikert(items, jw, onpick, intro, onsave) {
    const L = this.data.kuesioner.likert.split(' · ');
    App.main(`
      <div class="panel">${intro}<ul class="likert-legend">${L.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="lprog"><i style="width:${jw.filter(x => x != null).length / items.length * 100}%"></i></div>
      ${items.map((it, i) => `<div class="likert ${jw[i] != null ? 'ok' : ''}">
        <p><b>${i + 1}.</b> ${esc(it)}</p>
        <div class="seg likert-seg">${[1, 2, 3, 4, 5].map(v => `<button class="${jw[i] === v ? 'on' : ''}" onclick="${onpick.replace('%i', i).replace('%v', v)}" aria-label="${v}">${v}</button>`).join('')}</div>
        <div class="likert-ends"><small>${esc(L[0].replace(/^1\s*=\s*/, ''))}</small><small>${esc(L[4].replace(/^5\s*=\s*/, ''))}</small></div></div>`).join('')}
      ${this._extra || ''}
      <button class="btn primary block" onclick="${onsave}">${T('Save', 'Simpan')} ✓</button>`);
  },
  likert(f, key, i, v) {
    const s = this.get(), arr = ((s[f] || {})[key] || []).slice();
    arr[i] = v;
    this.fase(f, { [key]: arr });
    const y = window.scrollY;
    key === 'cemasDraf' ? this.renderSkala(f) : this.renderEval();
    window.scrollTo(0, y);
  },
  simpanSkala(f) {
    const items = this.butirCemas(), jw = (this.get()[f] || {}).cemasDraf || [];
    const kosong = items.findIndex((_, i) => jw[i] == null);
    if (kosong >= 0) { App.toast(T(`Statement ${kosong + 1} is not answered yet.`, `Pernyataan ${kosong + 1} belum dijawab.`)); return; }
    this.fase(f, { cemas: jw.slice(0, items.length), cemasWaktu: Date.now(), cemasDraf: null });
    this.kirimDiam();
    App.go('#/');
  },
  // Skor kecemasan: butir (R) dibalik; total 20–100, per dimensi A–D. Makin tinggi = makin cemas.
  skorCemas(jw) {
    if (!jw) return null;
    const out = { total: 0 }; let i = 0;
    for (const [di, d] of this.data.kuesioner.cemas.entries()) {
      const k = 'ABCD'[di]; out[k] = 0;
      for (const it of d.items) { const v = it.r ? 6 - jw[i] : jw[i]; out[k] += v; out.total += v; i++; }
    }
    return out;
  },

  /* ===== Tes awal / akhir (mesin Ujian) ===== */
  startTes(f) {
    if (!this.admin() && ((f === 'pre' && this.langkah() !== 2) || (f === 'post' && this.langkah() !== 5))) return App.go('#/');
    if (!this.get().urutTes) this.set({ urutTes: Math.random() < 0.5 ? 'AB' : 'BA' });   // counterbalancing paket tes
    const paket = this.get().urutTes[f === 'pre' ? 0 : 1], lv = this.get().level;
    const items = this.data.tes[lv][paket].map(t => ({ t, code: '' }));
    clearInterval(Ujian.timer);
    Soal.plays = {}; Soal.limit = Ujian.PLAY_LIMIT;
    Ujian.session = { kind: f, vol: 0, items, i: 0, answers: {}, intro: {}, phase: 'q', dur: 30 * 60, end: null, grid: false,
                      title: f === 'pre' ? T('Pre-test', 'Tes awal') : T('Post-test', 'Tes akhir'), back: '#/', paket };
    this.fase(f, { tesCoba: ((this.get()[f] || {}).tesCoba || 0) + 1 });
    App.go('#/ujian');
  },
  hasilTes(s) {
    Soal.limit = null;
    App.bar(s.title, '#/');
    const pre = this.get().pre?.tes;
    App.main(`
      <div class="result ${s.pct >= 80 ? 'hi' : s.pct >= 60 ? 'mid' : 'lo'}">
        ${App.ring(s.pct, s.pct + '%', 'ring-lg')}
        <div class="stats3 two">
          <div>${App.ring(s.l, s.l + '%')}<small lang="zh-TW">聽力</small></div>
          <div>${App.ring(s.r, s.r + '%')}<small lang="zh-TW">閱讀</small></div>
        </div>
        <p>${s.kind === 'pre'
          ? T('Thank you! The units are now open. This score is only your starting point — it will be compared with the post-test.', 'Terima kasih! Bab sekarang terbuka. Nilai ini hanya titik awalmu — nanti dibandingkan dengan tes akhir.')
          : T(`Pre-test ${pre?.skor ?? '–'}% → post-test ${s.pct}%. One last step: tell us what you think of the module.`, `Tes awal ${pre?.skor ?? '–'}% → tes akhir ${s.pct}%. Satu langkah lagi: beri pendapatmu tentang modul.`)}</p>
      </div>
      <button class="btn primary block" onclick="App.go('#/')">${T('Continue', 'Lanjut')} ›</button>`);
  },

  /* ===== Evaluasi modul ===== */
  renderEval() {
    if (!this.admin() && this.langkah() !== 6) return App.go('#/');
    const Q = this.data.kuesioner, d = this.get().post || {}, jw = d.evalDraf || [], tb = d.terbukaDraf || [];
    App.bar(T('Your opinion', 'Pendapatmu'), '#/');
    this._extra = `<h3 class="sub-title">${T('Short questions (optional)', 'Pertanyaan singkat (boleh dikosongkan)')}</h3>` + Q.terbuka.map((q, i) => `
      <label class="field-k" for="tb-${i}">${i + 1}. ${esc(q)}</label>
      <textarea id="tb-${i}" rows="2" oninput="Studi.terbuka(${i}, this.value)">${esc(tb[i] || '')}</textarea>`).join('');
    this.renderLikert(Q.eval, jw, `Studi.likert('post', 'evalDraf', %i, %v)`,
      `<p>${T('How much do you agree with these statements about the module?', 'Seberapa setuju kamu dengan pernyataan tentang modul ini?')}</p>`, 'Studi.simpanEval()');
    this._extra = '';
  },
  terbuka(i, v) { const d = this.get().post || {}, tb = (d.terbukaDraf || []).slice(); tb[i] = v; this.fase('post', { terbukaDraf: tb }); },
  simpanEval() {
    const Q = this.data.kuesioner, d = this.get().post || {}, jw = d.evalDraf || [];
    const kosong = Q.eval.findIndex((_, i) => jw[i] == null);
    if (kosong >= 0) return App.toast(T(`Statement ${kosong + 1} is not answered yet.`, `Pernyataan ${kosong + 1} belum dijawab.`));
    this.fase('post', { eval: jw.slice(0, Q.eval.length), terbuka: Q.terbuka.map((_, i) => (d.terbukaDraf || [])[i] || ''), evalWaktu: Date.now(), evalDraf: null, terbukaDraf: null });
    this.set({ selesai: Date.now() });
    this.kirimDiam();
    App.go('#/kirim');
  },

  /* ===== Kirim hasil ===== */
  payload() {
    const s = this.get(), prog = Store.get(STORAGE_KEY, {});
    const fase = f => {
      const d = s[f] || {};
      return { cemas: d.cemas || null, cemas_skor: this.skorCemas(d.cemas), cemas_waktu: d.cemasWaktu || null, tes: d.tes || null, tes_coba: d.tesCoba || 0 };
    };
    return {
      v: 'mini1', uid: this.kode(), uid_asal: this.uid(), putaran: this.putaran(), nama: s.profil?.nama || '', lang: s.lang || LANG, level: s.level || '',
      level_awal: s.arsip?.[0]?.level || s.level || '', urutan_tes: s.urutTes || '', email: s.profil?.email || '',
      posisi: s.posisi ? `${s.posisi.kode} · ${s.posisi.tahap}/6` : '', aktif: s.posisi?.waktu || null,
      profil: s.profil ? Object.fromEntries(Object.entries(this.PILIHAN()).map(([k, o]) => [k, o[s.profil[k]] ?? ''])) : {},
      mulai: s.mulai || null, selesai: s.selesai || null, waktu: new Date().toISOString(),
      perangkat: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'HP' : 'Komputer',
      pre: fase('pre'), post: fase('post'),
      eval: s.post?.eval || null, terbuka: s.post?.terbuka || null,
      modul: this.mods().map(m => {
        const p = prog[m.code] || {};
        return { kode: m.code, tahap: (p.stage || 0) + 1, selesai: !!p.done, selesai_waktu: p.doneAt || null,
                 tugas_best: p.tasks?.best ?? '', tugas_kali: p.tasks?.tries ?? '', tes_best: p.tes?.best ?? '', tes_kali: p.tes?.tries ?? '',
                 kata_hafal: Object.values(p.known || {}).filter(Boolean).length, yakin: (p.cando || []).filter(x => x === 2).length,
                 target: p.goal || '', sulit: p.diff || '', detik: p.detik || 0 };
      }),
    };
  },
  async kirim() {
    if (this.admin()) throw new Error('mode admin tidak mengirim data');
    if (!KIRIM_URL) throw new Error('KIRIM_URL kosong');
    const res = await fetch(KIRIM_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(this.payload()) });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'ditolak');
    this.set({ terkirim: Date.now(), gagalKirim: false });
  },
  kirimDiam() { if (this.get().profil?.setuju && !this.admin()) this.kirim().catch(() => this.set({ gagalKirim: true })); },
  renderKirim() {
    const s = this.get(), L = this.langkah();
    App.bar(T('Results', 'Hasil'), '#/');
    const pre = this.skorCemas(s.pre?.cemas), post = this.skorCemas(s.post?.cemas);
    App.main(`
      ${L === 7 ? `<div class="result hi">${Pic.html('🎉', 'pic-xl')}<p>${T('You have finished the whole trial. Thank you very much for taking part! 謝謝！', 'Kamu sudah menyelesaikan seluruh uji coba. Terima kasih banyak sudah ikut! 謝謝！')}</p></div>` : ''}
      <div class="stats3 two">
        <div>${App.ring(s.pre?.tes?.skor ?? 0, s.pre?.tes ? s.pre.tes.skor + '%' : '–')}<small>${T('Pre-test', 'Tes awal')}</small></div>
        <div>${App.ring(s.post?.tes?.skor ?? 0, s.post?.tes ? s.post.tes.skor + '%' : '–')}<small>${T('Post-test', 'Tes akhir')}</small></div>
      </div>
      ${pre && post ? `<p class="hint">${T(`Anxiety score (20 = calm, 100 = very anxious): ${pre.total} → ${post.total}`, `Skor kecemasan (20 = tenang, 100 = sangat cemas): ${pre.total} → ${post.total}`)}</p>` : ''}
      ${this.admin() ? `<p class="hint"><b>${T('Admin mode: nothing is sent.', 'Mode admin: data tidak dikirim.')}</b></p>` : ''}
      <div class="panel"><div class="panel-k">${Pic.html('📤', 'ic-sm')} ${T('Sending to the researcher', 'Pengiriman ke peneliti')}</div>
        <p>${s.terkirim ? `${T('Last sent', 'Terakhir terkirim')}: ${new Date(s.terkirim).toLocaleString(Lang.LOCALE)}` : T('Not sent yet.', 'Belum terkirim.')}
        ${s.gagalKirim ? `<br><b>${T('The last attempt failed — check your internet connection and press the button below.', 'Pengiriman terakhir gagal — periksa koneksi internet lalu tekan tombol di bawah.')}</b>` : ''}</p>
        <p class="hint">${T('Your results are sent automatically after each step. You can also send them again here — the old data is updated, not duplicated.', 'Hasilmu terkirim otomatis setelah tiap langkah. Kamu juga bisa mengirim ulang di sini — data lama diperbarui, tidak dobel.')}</p>
        <p class="hint">${T('Participant code', 'Kode peserta')}: <b>${this.kode()}</b></p></div>
      <button class="btn primary block" id="k-btn" onclick="Studi.kirimTombol()">${Pic.html('📤', 'ic-sm')} ${T('Send results now', 'Kirim hasil sekarang')}</button>
      <p class="hint" id="k-status"></p>
      ${this.lanjutHTML()}`);
  },
  async kirimTombol() {
    const btn = document.getElementById('k-btn'), st = document.getElementById('k-status');
    btn.disabled = true; st.textContent = T('Sending…', 'Mengirim…');
    try { await this.kirim(); App.toast(T('Results sent. 謝謝！', 'Hasil terkirim. 謝謝！')); this.renderKirim(); }
    catch { this.set({ gagalKirim: true }); st.textContent = T('Sending failed. Check your internet connection, then try again.', 'Gagal mengirim. Periksa koneksi internet, lalu coba lagi.'); btn.disabled = false; }
  },

  /* ===== Petunjuk peserta (tombol ? di bar atas) ===== */
  bukaPetunjuk() { if (!location.hash.startsWith('#/petunjuk')) this._dari = location.hash || '#/'; App.go('#/petunjuk'); },
  renderPetunjuk() {
    App.bar(T('Instructions', 'Petunjuk'), this._dari || '#/');
    const li = xs => xs.map(x => `<li>${x}</li>`).join('');
    const langkah = [
      [T('About you', 'Data diri'), T('Your level is set automatically from your answers.', 'Levelmu ditentukan otomatis dari jawabanmu.'), '± 3 min'],
      [T('Questionnaire before', 'Kuesioner awal'), '', '± 5 min'],
      [T('Pre-test', 'Tes awal'), '', '30 min', 1],
      [T('Study 6 units', 'Pelajari 6 bab'), T('Including the tasks and the unit test in each.', 'Termasuk tugas dan Tes Bab di tiap bab.'), ''],
      [T('Questionnaire after', 'Kuesioner akhir'), '', '± 5 min'],
      [T('Post-test', 'Tes akhir'), '', '30 min', 1],
      [T('Your opinion of the module', 'Pendapatmu tentang modul'), '', ''],
    ];
    App.main(`
      <div class="panel"><div class="panel-k">${Pic.html('📱', 'ic-sm')} ${T('Before you start', 'Sebelum mulai')}</div>
        <ul class="ptj">${li([
          T('Use <b>the same phone and the same browser</b> from start to finish. Your progress is saved on that phone.', 'Pakai <b>satu HP dan satu browser yang sama</b> dari awal sampai akhir. Progresmu tersimpan di HP itu.'),
          T('<b>Do not clear your browser history</b> until you finish, and do not use Incognito/Private mode.', '<b>Jangan hapus riwayat browser</b> sampai selesai, dan jangan pakai mode Incognito/Private.'),
          T('Enter your <b>real name or initials</b> and an <b>active email address</b>.', 'Tulis <b>nama atau inisial asli</b> dan <b>email aktif</b> yang benar.'),
          T('Have <b>earphones</b> ready for the listening questions.', 'Siapkan <b>earphone</b>, karena ada soal mendengarkan.'),
          T('Finish within <b>7 days</b> (by <b>14 October</b> at the latest). About one unit a day is enough.', 'Selesaikan dalam <b>7 hari</b> (paling lambat <b>14 Oktober</b>). Kira-kira satu bab per hari sudah cukup.'),
          T('<b>iPhone users:</b> open the module at least every few days. If Safari does not open it for 7 days, your progress may be deleted.', '<b>Pengguna iPhone:</b> buka modul paling tidak setiap beberapa hari. Jika tidak dibuka di Safari selama 7 hari, progresmu bisa terhapus.')])}</ul></div>
      <div class="panel"><div class="panel-k">${Pic.html('🧭', 'ic-sm')} ${T('Steps', 'Urutan langkah')}</div>
        <ol class="ptj-langkah">${langkah.map(([j, n, w, tes]) => `<li class="${tes ? 'tes' : ''}"><span><b>${j}</b>${n ? `<small>${n}</small>` : ''}</span><span class="ptj-w">${w}</span></li>`).join('')}</ol></div>
      <div class="panel ptj-aturan"><div class="panel-k">${Pic.html('⚠️', 'ic-sm')} ${T('During the pre-test and post-test', 'Saat tes awal dan tes akhir')}</div>
        <ul class="ptj">${li([
          T('Sit somewhere quiet without interruptions for 30 minutes.', 'Kerjakan di tempat yang tenang, tanpa gangguan selama 30 menit.'),
          T('The audio button can be pressed <b>once</b>; the audio then plays <b>twice automatically</b>.', 'Tombol audio hanya bisa ditekan <b>sekali</b>, lalu audio diputar <b>2× otomatis</b>.'),
          T('Tests and questionnaires <b>cannot be repeated</b>. Answer honestly and on your own.', 'Tes dan kuesioner <b>tidak bisa diulang</b>. Jawablah dengan jujur dan dengan kemampuanmu sendiri.')])}</ul></div>
      <p class="hint">${T('Your results are sent to the researcher automatically (internet needed). When you finish, you may continue to the next level, but it is optional.', 'Hasilmu terkirim otomatis ke peneliti (butuh internet). Setelah selesai, kamu boleh lanjut ke level berikutnya, tapi tidak wajib.')}</p>
      <p class="hint">${T('Questions? Contact the researcher:', 'Ada pertanyaan? Hubungi peneliti:')}<br><b><span lang="zh-TW">葉查理</span> CARLI PHANIATATN</b> · <b style="user-select: all; overflow-wrap: anywhere;">chaliyip@gmail.com</b></p>
      <button class="btn primary block" onclick="App.go('${this._dari || '#/'}')">${T('Got it', 'Mengerti')} ✓</button>`);
  },

  /* ===== Kata pendukung: kata di dialog/soal yang diajarkan di bab yang tidak ikut uji coba ===== */
  pendukungHTML(m) {
    const list = m.vocab.pendukung || [];
    if (!list.length) return '';
    return `<details class="panel pend-list"><summary class="panel-k">${T(`Supporting words from other units · ${list.length}`, `Kata pendukung dari bab lain · ${list.length}`)}</summary>
      <p class="hint">${T('These words appear in this unit but were taught in units that are not part of this trial. You do not need to memorise them — tap a word to hear it.', 'Kata-kata ini muncul di bab ini tetapi diajarkan di bab yang tidak termasuk uji coba. Tidak perlu dihafal — ketuk kata untuk mendengarnya.')}</p>
      <div class="pend-grid">${list.map(v => `<button class="pend-w" onclick="Speech.word('${esc(v.say || v.w)}')"><b lang="zh-TW">${esc(v.w)}</b><small>${esc(v.py)}</small><span>${esc(v.meaning)}</span></button>`).join('')}</div></details>`;
  },
};

/* ===== Sambungan ke app utama ===== */
const Kirim = { aktif: () => false, render: () => Studi.renderKirim() };

// Kosakata yang disorot di dialog = kosakata bab + kata pendukung (dipakai Modul.highlight & Modul.kw)
Modul.hlVocab = function () { return [...this.allVocab(), ...(this.m.vocab.pendukung || []).map(v => ({ ...v, layer: 'pend' }))]; };
const _rVocab = Modul.r_vocab;
Modul.r_vocab = function () { return _rVocab.call(this) + Studi.pendukungHTML(this.m); };
Modul.finish = function () {
  const d = document.getElementById('diff-input');
  if (!App.getP(this.m.code).tasks) { App.toast(T('Do the tasks (stage 4) first.', 'Kerjakan tugas (tahap 4) dulu.')); return this.go(3); }
  App.setP(this.m.code, { diff: d ? d.value.trim() : '', done: true, doneAt: App.getP(this.m.code).doneAt || Date.now() });
  Studi.kirimDiam();
  App.toast(`${this.m.code} ${T('done', 'selesai')}. 加油！`);
  App.go('#/');
};
App.renderHome = () => Studi.renderHome();
// Lama belajar per bab: +15 detik setiap 15 detik selama bab terbuka, layar terlihat, dan ada sentuhan/gulir/audio dalam 3 menit terakhir
let _aktif = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(e => addEventListener(e, () => { _aktif = Date.now(); }, { passive: true }));
setInterval(() => {
  const m = location.hash.match(/^#\/m\/([A-Z]\d+)/);
  if (!m || document.hidden || Studi.admin() || Date.now() - _aktif > 180000) return;
  App.setP(m[1], { detik: (App.getP(m[1]).detik || 0) + 15 });
}, 15000);
// Progres di dalam bab ikut terkirim: setiap kali peserta mencapai tahap BARU (bukan sekadar bolak-balik),
// posisi terakhir dicatat & dikirim (ditunda 3 detik supaya pindah tahap cepat-cepat hanya terkirim sekali).
const _modOpen = Modul.open;
Modul.open = function (code, stage) {
  const before = App.getP(code).stage;
  _modOpen.call(this, code, stage);
  const after = App.getP(code).stage;
  if (Studi.admin() || !Studi.mods().some(m => m.code === code) || (before != null && after <= before)) return;
  Studi.set({ posisi: { kode: code, tahap: after + 1, waktu: Date.now() } });
  clearTimeout(Studi._tunda); Studi._tunda = setTimeout(() => Studi.kirimDiam(), 3000);
};

/* ===== 溝通任務: urutan pilihan A/B/C diacak setiap kali "Coba lagi" =====
   Percobaan pertama memakai urutan asli. Acakan disimpan per bab (di memori) dan dipasang ulang setiap render,
   karena Modul.open selalu memuat data asli. cloze tidak diacak (pilihannya dipakai bersama beberapa titik kosong).
   Audio 聽力 Part 1 ("A，…" "B，…") untuk semua kombinasi huruf × pilihan direkam oleh buat_audio.py. */
const acakUrut = n => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const bisaAcak = t => Array.isArray(t.options) && t.options.length > 1 && typeof t.answer === 'number' && t.type !== 'cloze';
Modul._acak = {};
const _modRender = Modul.render, _modRetry = Modul.retry;
Modul.render = function () {
  const perm = this._acak[this.m.code];
  if (perm && this.m._perm !== perm) {
    const asli = App.findModule(this.m.code).m;
    this.m = Object.assign({}, asli, { _perm: perm, tasks: asli.tasks.map((t, i) => {
      const p = perm[i];
      if (!p || p.every((x, k) => x === k)) return t;
      return Object.assign({}, t, { options: p.map(j => t.options[j]), answer: p.indexOf(t.answer), urutAsli: t.options });
    }) });
  }
  return _modRender.call(this);
};
Modul.retry = function () {
  const asli = App.findModule(this.m.code).m, lama = this._acak[asli.code] || [];
  this._acak[asli.code] = asli.tasks.map((t, i) => {
    if (!bisaAcak(t)) return null;
    let p = acakUrut(t.options.length);
    const kini = (lama[i] || [...Array(t.options.length).keys()]).join();   // urutan yang sedang tampil
    for (let k = 0; k < 20 && p.join() === kini; k++) p = acakUrut(t.options.length);
    return p;
  });
  return _modRetry.call(this);
};

/* ===== Tahap bab terbuka berurutan (hanya pada pengerjaan PERTAMA) =====
   Tujuan → Dialog (semua kalimat sudah diputar) → Kosakata (semua kartu sudah dilihat) → Tugas (semua soal dijawab,
   tanpa nilai minimum) → Grammar (Cek cepat & latihan dijawab, benar/salah tidak masalah) → Refleksi.
   Setelah bab selesai (atau di mode admin) semua tahap bebas. Bagian yang belum dikerjakan diberi tanda oranye.
   Syarat yang sudah terpenuhi disimpan di progres (lulus[tahap]) sehingga "Ulangi" tidak mengunci lagi. */
const Tahap = {
  bebas(code) { return Studi.admin() || !!App.getP(code).done; },
  dialogBelum(m, p) { const d = p.dengar || {}, out = []; m.dialogs.forEach((x, di) => x.lines.forEach((_, li) => { if (!d[`${di}-${li}`]) out.push([di, li]); })); return out; },
  kartuBelum(m, p) { const l = p.lihat || {}; return Modul.allVocab.call({ m }).filter(v => !l[v.w]); },
  gramBelum(m, p) {
    const gc = p.gchecks || {}, gl = p.glat || {}, out = [];
    m.grammar.forEach((g, gi) => { if (g.check && gc[gi] == null) out.push(`c${gi}`); (g.latihan || []).forEach((_, li) => { if (gl[`${gi}-${li}`] == null) out.push(`${gi}-${li}`); }); });
    (m.latihan || []).forEach((_, li) => { if (gl[`b-${li}`] == null) out.push(`b-${li}`); });
    return out;
  },
  // [selesai?, sisa, total] untuk tahap 0–4 (tahap 5 = refleksi, diselesaikan dengan tombol Selesai)
  status(m) {
    const p = App.getP(m.code), lulus = p.lulus || {};
    const nKal = m.dialogs.reduce((a, d) => a + d.lines.length, 0), nKar = Modul.allVocab.call({ m }).length;
    const nGram = m.grammar.reduce((a, g) => a + (g.check ? 1 : 0) + (g.latihan || []).length, 0) + (m.latihan || []).length;
    const st = [
      [true, 0, 0],
      [!!lulus[1], this.dialogBelum(m, p).length, nKal],
      [!!lulus[2], this.kartuBelum(m, p).length, nKar],
      [!!lulus[3] || !!p.tasks, 0, 0],
      [!!lulus[4], this.gramBelum(m, p).length, nGram],
    ];
    st.forEach((x, i) => { if (!x[0] && i && i !== 3 && x[1] === 0) x[0] = true; });
    const baru = {}; st.forEach((x, i) => { if (x[0] && !lulus[i]) baru[i] = 1; });
    if (Object.keys(baru).length) App.setP(m.code, { lulus: Object.assign({}, lulus, baru) });
    return st;
  },
  // tahap tertinggi yang boleh dibuka
  batas(m) { if (this.bebas(m.code)) return 5; const st = this.status(m); let k = 0; while (k < 5 && st[k][0]) k++; return k; },
  pesan(m, k) {
    const st = this.status(m)[k] || [true, 0, 0];
    return [null,
      T(`Listen to every line first (tap ▶ Play or 🔊). Still to listen: ${st[1]} of ${st[2]} lines — marked in orange.`, `Dengarkan dulu setiap kalimat (tekan ▶ Putar atau 🔊). Belum didengar: ${st[1]} dari ${st[2]} kalimat — bertanda oranye.`),
      T(`Open every word card once (use › to move). Still to open: ${st[1]} of ${st[2]} cards — the orange dots.`, `Buka setiap kartu kata sekali (pakai tombol ›). Belum dibuka: ${st[1]} dari ${st[2]} kartu — titik oranye.`),
      T('Answer every question once. Your score does not need to be perfect.', 'Jawab semua soal sekali. Nilainya tidak harus sempurna.'),
      T(`Answer the quick checks and the practice questions — right or wrong does not matter. Still open: ${st[1]} of ${st[2]}.`, `Jawab Cek cepat dan latihan — benar atau salah tidak masalah. Belum dijawab: ${st[1]} dari ${st[2]}.`)][k];
  },
};
// Dialog: kalimat dihitung "sudah didengar" begitu diputar (▶ Putar, Baris berikutnya, atau 🔊) — juga bila audionya gagal
const _speechLines = Speech.lines;
Speech.lines = function (lines) {
  _aktif = Date.now();
  try {
    if (location.hash.startsWith('#/m/') && Modul.m && Modul.key() === 'dialog') {
      const p = App.getP(Modul.m.code), d = Object.assign({}, p.dengar || {});
      Modul.m.dialogs.forEach((x, di) => x.lines.forEach((l, li) => { if (lines.some(y => y === l || (y.zh === l.zh && y.sp === l.sp))) d[`${di}-${li}`] = 1; }));
      App.setP(Modul.m.code, { dengar: d });
      setTimeout(() => Tahap.tandai(), 0);
    }
  } catch (e) {}
  return _speechLines.apply(this, arguments);
};
Tahap.tandai = function () {
  const m = Modul.m; if (!m || !document.querySelector('.stage')) return;
  const p = App.getP(m.code), bebas = this.bebas(m.code), st = this.status(m), batas = this.batas(m);
  // penanda tahap: ✓ selesai · 🔒 terkunci
  document.querySelectorAll('nav.steps .step').forEach((b, i) => {
    b.classList.toggle('lulus', i < 5 ? st[i][0] : !!p.done);
    b.classList.toggle('kunci', !bebas && i > batas);
  });
  if (bebas) return;
  const k = Modul.key();
  if (k === 'dialog') {
    const d = p.dengar || {};
    document.querySelectorAll('.stage-dialog .chat').forEach((c, di) => c.querySelectorAll('.msg').forEach((el, li) => el.classList.toggle('belum', !d[`${di}-${li}`])));
  }
  if (k === 'vocab') {
    const l = p.lihat || {}, all = Modul.allVocab();
    document.querySelectorAll('.stage-vocab .dots i').forEach((el, i) => el.classList.toggle('belum', !!all[i] && !l[all[i].w]));
    document.querySelectorAll('.stage-vocab .vcell').forEach((el, i) => el.classList.toggle('belum', !!all[i] && !l[all[i].w]));
  }
  if (k === 'grammar') {
    const sisa = new Set(this.gramBelum(m, p));
    document.querySelectorAll('.stage-grammar .gcard').forEach((g, gi) => {
      g.querySelector('.gcheck')?.classList.toggle('belum', sisa.has(`c${gi}`));
      g.querySelectorAll('.glat-q').forEach((q, li) => q.classList.toggle('belum', sisa.has(`${gi}-${li}`)));
    });
    const bab = [...document.querySelectorAll('.stage-grammar .glat')].find(x => !x.closest('.gcard'));
    bab?.querySelectorAll('.glat-q').forEach((q, li) => q.classList.toggle('belum', sisa.has(`b-${li}`)));
  }
  // keterangan syarat di bawah tahap (warna netral, bukan merah)
  let box = document.querySelector('.syarat');
  const idx = Modul.stage, txt = idx < 5 && !st[idx][0] ? this.pesan(m, idx) : '';
  if (!txt) { box?.remove(); return; }
  if (!box) { box = document.createElement('p'); box.className = 'syarat'; document.querySelector('.stage').appendChild(box); }
  box.innerHTML = `${Pic.html('🧭', 'ic-sm')} ${txt}`;
};
const _modOpenT = Modul.open, _modRenderT = Modul.render, _modNext = Modul.next, _modGo = Modul.go;
Modul.open = function (code, stage) {
  const f = App.findModule(code);
  if (f && !Tahap.bebas(code)) {
    const b = Tahap.batas(f.m);
    if ((stage || 0) > b) { App.toast(T('Finish the earlier stages first — this one opens after that.', 'Selesaikan tahap sebelumnya dulu — tahap ini terbuka setelah itu.')); return App.go(`#/m/${code}/${b}`); }
  }
  return _modOpenT.call(this, code, stage);
};
Modul.render = function () {
  // Kosakata: kartu yang sedang tampil dihitung "sudah dilihat"
  if (this.key() === 'vocab' && !this.vlist && !Tahap.bebas(this.m.code)) {
    const all = this.allVocab(), v = all[Math.min(this.vi, all.length - 1)], p = App.getP(this.m.code);
    if (v && !(p.lihat || {})[v.w]) App.setP(this.m.code, { lihat: Object.assign({}, p.lihat, { [v.w]: 1 }) });
  }
  const r = _modRenderT.call(this);
  Tahap.tandai();
  return r;
};
Modul.next = function () {
  if (!Tahap.bebas(this.m.code) && this.stage < 5 && !Tahap.status(this.m)[this.stage][0]) {
    App.toast(T('Almost there 🙂 ', 'Sedikit lagi 🙂 ') + Tahap.pesan(this.m, this.stage));
    document.querySelector('.syarat')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (this.key() === 'intro') this.saveGoal();
    return;
  }
  return _modNext.call(this);
};
Modul.go = function (i) {
  if (!Tahap.bebas(this.m.code) && i > Tahap.batas(this.m)) return App.toast(T('This stage opens after you finish the earlier ones.', 'Tahap ini terbuka setelah tahap sebelumnya selesai.'));
  return _modGo.call(this, i);
};
const _rIntro = Modul.r_intro;
Modul.r_intro = function () {
  const h = _rIntro.call(this);
  return Tahap.bebas(this.m.code) ? h : h.replace(/<p class="hint">[^<]*<\/p>\s*$/, `<p class="hint">${T('The stages open one by one. When you finish this unit, all stages stay open and you can repeat anything as often as you like.', 'Tahap terbuka satu per satu. Setelah bab ini selesai, semua tahap terbuka bebas dan boleh diulang sesering yang kamu mau.')}</p>`);
};

// Tes awal/akhir memakai mesin Ujian; paragraf Part 4 bernomor per titik kosong seperti naskah
Ujian.w = function (t) { const k = this.session.kind; return (this.session.full || k === 'pre' || k === 'post') && t.type === 'cloze' ? t.answers.length : 1; };
const _finish = Ujian.finish, _result = Ujian.result;
Ujian.finish = function () {
  const s = this.session;
  if (s.kind !== 'pre' && s.kind !== 'post') return _finish.call(this);
  clearInterval(this.timer); Speech.stop();
  const per = this.PARTS.map(() => [0, 0]), butir = [];
  s.items.forEach((x, i) => {
    const a = s.answers['u' + i], [g, n] = Soal.score(x.t, a), p = per[this.partOf(x.t)];
    p[0] += g; p[1] += n;
    if (x.t.type === 'cloze') x.t.answers.forEach((k, j) => butir.push({ no: x.t.no + j, jawab: a?.vals?.[j] != null ? 'ABCDEF'[a.vals[j]] : '', benar: a?.vals?.[j] === k ? 1 : 0 }));
    else butir.push({ no: x.t.no, jawab: a != null ? 'ABCDEF'[a] : '', benar: a === x.t.answer ? 1 : 0 });
  });
  const sum = arr => arr.reduce((a, [g, n]) => [a[0] + g, a[1] + n], [0, 0]), pc = ([g, n]) => n ? Math.round(g / n * 100) : 0;
  s.per = per; s.pct = pc(sum(per)); s.l = pc(sum(per.slice(0, 4))); s.r = pc(sum(per.slice(4)));
  s.used = this.elapsed(); s.phase = 'result';
  const [benar, dari] = sum(per);
  Studi.fase(s.kind, { tes: { paket: s.paket, skor: s.pct, benar, dari, dengar: s.l, baca: s.r, detik: s.used, selesai: Date.now(), butir } });
  Studi.kirimDiam();
  App.go('#/ujian');
};
Ujian.result = function () { const s = this.session; return s.kind === 'pre' || s.kind === 'post' ? Studi.hasilTes(s) : _result.call(this); };

/* ===== 聽力 gaya TOCFL di tes awal/akhir & Tes Bab (semua level) =====
   Tombol putar hanya bisa ditekan sekali; naskah lalu diputar ULANG× otomatis (jeda JEDA_ULANG ms di antaranya).
   Kecepatan tetap 1× (pilihan kecepatan disembunyikan), jeda antarkalimat lebih panjang,
   bunyi bel di posisi t.bel; teks 問 tidak dicetak selama ujian (seperti naskah TOCFL).
   Urutan klip: Part 1 = [問, A, B, C]; Part 2–4 = [baris dialog…, 問]. t.bel = daftar nomor klip yang DIDAHULUI bel
   (diedit lewat 🔔 di _kerja/mini/edit-tes-mini.xlsx). Tanpa t.bel: Part 2–4 → bel sebelum 問, Part 1 → tanpa bel. */
const tocflAktif = () => { const s = Ujian.session; return !!s && ['pre', 'post', 'tes'].includes(s.kind) && s.phase === 'q'; };   // tes = Tes Bab
const ULANG = 2, JEDA_ULANG = 2500;
const TocflAudio = {
  ac: null,
  jeda: ms => new Promise(r => setTimeout(r, ms)),
  // Bel "ding" satu kali (Web Audio, tanpa file)
  bel() {
    return new Promise(done => {
      try {
        const C = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)());
        C.resume();
        const t0 = C.currentTime + 0.05;
        for (const [f, g] of [[1318.5, 0.35], [2637, 0.08]]) {
          const o = C.createOscillator(), v = C.createGain();
          o.type = 'sine'; o.frequency.value = f;
          v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(g, t0 + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
          o.connect(v).connect(C.destination); o.start(t0); o.stop(t0 + 1.4);
        }
        setTimeout(done, 1500);
      } catch { done(); }
    });
  },
  async putar(t, onend, onputaran) {
    Speech.stop();
    const tok = Speech.token, ok = () => tok === Speech.token, rate = Speech.rate;
    Speech.rate = 1;
    // klip: [teks, profil, jeda sesudahnya (ms)]
    const klip = t.type === 'listen_pic'
      ? Soal.picTexts(t).map((x, i) => [x, 'N', i === 0 ? 1200 : 900])
      : [...(t.lines || []).map(l => [l.zh, Speech.profil(l.sp), 600]), ...(t.question ? [[t.question, 'N', 0]] : [])];
    const bel = t.bel || (t.type === 'listen_pic' ? [] : [klip.length - 1]);
    Speech.preload(klip.map(([x, p]) => [x, p]));
    try {
      for (let n = 1; n <= ULANG; n++) {
        if (n > 1) { await this.jeda(JEDA_ULANG); if (!ok()) return; }
        if (onputaran) onputaran(n);
        for (const [i, [x, p, j]] of klip.entries()) {
          if (!ok()) return;
          if (bel.includes(i)) { await this.jeda(300); await this.bel(); if (!ok()) return; }
          await Speech.play(x, p, tok); await this.jeda(j);
        }
        if (bel.includes(klip.length) && ok()) await this.bel();   // 🔔 di akhir naskah
      }
    } finally { Speech.rate = rate; }
    if (ok() && onend) onend();
  },
};
// Tombol putar hanya sekali (render() memasang Soal.limit dari PLAY_LIMIT); layar pembuka bagian menyebut "diputar 2× otomatis"
const _ujianRender = Ujian.render, PLAY_ASLI = Ujian.PLAY_LIMIT, _partIntro = Ujian.partIntro;
Ujian.render = function () { this.PLAY_LIMIT = tocflAktif() ? 1 : PLAY_ASLI; return _ujianRender.call(this); };
Ujian.partIntro = function (pi) {
  const r = _partIntro.call(this, pi), el = document.querySelector('.part-intro small');
  if (tocflAktif() && el) el.innerHTML = el.innerHTML.replace(`${T('audio max.', 'audio maks.')} 1×`, T('audio plays 2× automatically (one tap)', 'audio diputar 2× otomatis (sekali tekan)'));
  return r;
};
const _soalPlay = Soal.play, _soalBody = Soal.body, _speedUI = Speech.speedUI;
Soal.play = function (key) {
  const t = this.reg[key];
  if (!tocflAktif() || !t) return _soalPlay.call(this, key);
  if ((this.plays[key] || 0) >= 1) return App.toast(T('The audio has already been played (2× automatically) and cannot be repeated.', 'Audio sudah diputar (2× otomatis) dan tidak bisa diulang.'));
  this.plays[key] = 1;
  const btn = document.getElementById('play-' + key), kecil = m => { const s = btn && btn.querySelector('small'); if (s) s.textContent = m; };
  if (btn) btn.classList.add('playing');
  TocflAudio.putar(t, () => { if (btn) btn.classList.remove('playing'); kecil(T('played 2×', 'sudah diputar 2×')); },
                   n => kecil(T(`playing ${n}/2`, `diputar ${n}/2`)));
};
Soal.body = function (t, key, a, ns, mode) {
  let h = _soalBody.call(this, t, key, a, ns, mode);
  if (t.urutAsli && /(^|[^A-Za-z0-9])[A-D]([^A-Za-z0-9]|$)/.test(t.why || '')) {
    const lbl = o => typeof o === 'string' ? o : (o.label || o.icon || '');
    h = h.replace(/(<div class="feedback[^"]*">[\s\S]*?<p>[\s\S]*?<\/p>)/, `$1<p class="urut-asli">${T('The order of the choices was shuffled. Letters in the explanation refer to the original order:', 'Urutan pilihan diacak. Huruf di penjelasan mengikuti urutan asli:')} ${t.urutAsli.map((o, i) => `<b>${'ABCD'[i]}</b> <span lang="zh-TW">${esc(lbl(o))}</span>`).join(' · ')}</p>`);
  }
  return tocflAktif() && mode === 'exam' && this.isListen(t) ? h.replace(/<div class="q-ask" lang="zh-TW">問：[^<]*<\/div>/, '') : h;
};
Speech.speedUI = function () { return tocflAktif() ? '' : _speedUI.call(this); };

// Tombol ? (petunjuk) di bar atas semua halaman — disembunyikan selama tes awal/akhir/Tes Bab berjalan
const _bar = App.bar;
App.bar = function (title, back, extra = '') {
  const tes = location.hash.startsWith('#/ujian') && Ujian.session && Ujian.session.phase !== 'result';
  const tombol = tes || location.hash.startsWith('#/petunjuk') ? '' : `<button class="bar-pill bar-help" onclick="Studi.bukaPetunjuk()" aria-label="${T('Instructions', 'Petunjuk')}" title="${T('Instructions', 'Petunjuk')}">?</button>`;
  return _bar.call(this, title, back, extra + tombol);
};

// Rute tambahan: #/petunjuk · #/studi/profil · #/studi/skala/pre|post · #/studi/tes/pre|post · #/studi/eval · #/kirim
const _route = App.route;
App.route = async function () {
  if (!Lang.dipilih) return Studi.renderBahasa();
  const p = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  try { await Studi.load(); } catch { return App.main(`<div class="empty"><p>${T('Could not load the data. Check your connection, then reload.', 'Gagal memuat data. Periksa koneksi, lalu muat ulang.')}</p></div>`); }
  if (p[0] === 'studi') {
    Speech.stop();
    if (p[1] === 'profil') return Studi.renderProfil();
    if (p[1] === 'skala') return Studi.renderSkala(p[2]);
    if (p[1] === 'tes') return Studi.startTes(p[2]);
    if (p[1] === 'eval') return Studi.renderEval();
    return App.go('#/');
  }
  if (p[0] === 'kirim') { Speech.stop(); return Studi.renderKirim(); }
  if (p[0] === 'petunjuk') { Speech.stop(); return Studi.renderPetunjuk(); }
  // Bab hanya terbuka setelah tes awal, dan hanya bab level peserta; peta volume tidak dipakai (beranda = peta)
  if (p[0] === 'm' && ((!Studi.admin() && Studi.langkah() < 3) || !Studi.mods().some(m => m.code === p[1]))) return App.go('#/');
  if (p[0] === 'v' && p[2] !== 'kata') return App.go('#/');
  return _route.call(this);
};

// Versi Vietnam: nama & petunjuk bagian ujian dan strategi refleksi ditulis di luar T() di app utama
if (LANG === 'vi') {
  STAGES[1][2] = 'Hội thoại'; STAGES[4][2] = 'Ngữ pháp';
  Ujian.PARTS = Ujian.PARTS.map(p => [p[0], p[1], Lang.vi(p[2]), Lang.vi(p[3]), p[4]]);
  const _rReflect = Modul.r_reflect;
  const STRAT = ['Replay the dialogue and listen', 'Practise the 核心 words with audio', 'Redo the tasks', 'Move on to the next module'];
  Modul.r_reflect = function () { let h = _rReflect.call(this); for (const s of STRAT) h = h.replace(s, esc(Lang.vi(s))); return h; };
}
