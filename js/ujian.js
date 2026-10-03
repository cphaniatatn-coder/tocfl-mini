/* Mesin ujian bergaya TOCFL Band A (聽力 lalu 閱讀, batas waktu, tanpa umpan balik sampai
   dikumpulkan, lalu tinjauan per soal + alasan). Dipakai untuk dua hal:
   - Ujian simulasi per volume (kind 'vol'): paket acak menurut bobot bagian resmi.
   - Tes Bab (kind 'tes'): 10 butir dari bank soal bab itu (data/bank_soal.json). */

const UJIAN_KEY = 'tocflmini_ujian';

const Ujian = {
  session: null, timer: null,
  // Bobot tiap bagian (mengikuti jumlah soal ujian resmi Band A: 聽力 25/15/5/5, 閱讀 15/15/10/5/5)
  // [bagian, bobot, nama, petunjuk Indonesia, petunjuk Mandarin] — petunjuk dwibahasa seperti naskah resmi
  PARTS: LANG === 'id' ? [
    ['聽力 Part 1', 25, 'Deskripsi gambar', 'Lihat gambar, dengarkan pertanyaan dan tiga jawaban (A–C), lalu pilih yang cocok dengan gambar.', '每題有一張圖片，你會先聽到一個問題，接著再聽到(A)(B)(C)三個選項，請根據圖片選出正確的答案。'],
    ['聽力 Part 2', 15, 'Tanya-jawab', 'Dengarkan tanya-jawab singkat, pilih gambar atau tanggapan yang tepat.', '請聽一段簡短的問答，選出正確的答案。'],
    ['聽力 Part 3', 5, 'Dialog', 'Dengarkan dialog beberapa putaran dan pertanyaannya.', '請聽一段對話和問題，選出正確的答案。'],
    ['聽力 Part 4', 5, 'Makna tersirat', 'Dengarkan dialog, tangkap maksud yang tidak diucapkan langsung. Pilih A–D.', '請聽一段對話和問題，從四個選項中選出正確的答案。'],
    ['閱讀 Part 1', 15, 'Kalimat → gambar', 'Baca satu kalimat, pilih gambar yang cocok.', '請看一個句子，從三張圖片中選出相符的圖片。'],
    ['閱讀 Part 2', 15, 'Gambar → kalimat', 'Lihat gambar, pilih kalimat yang cocok.', '請看圖片，選出與圖片相符的句子。'],
    ['閱讀 Part 3', 10, 'Isian bergambar', 'Lihat gambar, pilih kata yang tepat untuk titik kosong.', '請看圖片，選出最適合填入空格的詞。'],
    ['閱讀 Part 4', 5, 'Melengkapi paragraf', 'Isi titik kosong dalam paragraf. Satu pilihan hanya dipakai sekali; ada pilihan yang tidak terpakai.', '請根據短文的上下文，選出最適合的答案。一個選項只能用一次。'],
    ['閱讀 Part 5', 5, 'Pemahaman bacaan', 'Baca teks pendek, pilih jawaban A–D.', '請閱讀短文，回答問題。'],
  ] : [
    ['聽力 Part 1', 25, 'Picture description', 'Look at the picture, listen to the question and three answers (A–C), then choose the one that matches the picture.', '每題有一張圖片，你會先聽到一個問題，接著再聽到(A)(B)(C)三個選項，請根據圖片選出正確的答案。'],
    ['聽力 Part 2', 15, 'Question & answer', 'Listen to a short exchange and choose the right picture or response.', '請聽一段簡短的問答，選出正確的答案。'],
    ['聽力 Part 3', 5, 'Dialogue', 'Listen to a dialogue of several turns and the question.', '請聽一段對話和問題，選出正確的答案。'],
    ['聽力 Part 4', 5, 'Implied meaning', 'Listen to the dialogue and catch what is meant but not said directly. Choose A–D.', '請聽一段對話和問題，從四個選項中選出正確的答案。'],
    ['閱讀 Part 1', 15, 'Sentence → picture', 'Read one sentence and choose the matching picture.', '請看一個句子，從三張圖片中選出相符的圖片。'],
    ['閱讀 Part 2', 15, 'Picture → sentence', 'Look at the picture and choose the matching sentence.', '請看圖片，選出與圖片相符的句子。'],
    ['閱讀 Part 3', 10, 'Gap fill with picture', 'Look at the picture and choose the right word for the blank.', '請看圖片，選出最適合填入空格的詞。'],
    ['閱讀 Part 4', 5, 'Paragraph completion', 'Fill in the blanks in the paragraph. Each option can be used only once; some options are not used.', '請根據短文的上下文，選出最適合的答案。一個選項只能用一次。'],
    ['閱讀 Part 5', 5, 'Reading comprehension', 'Read a short text and choose answer A–D.', '請閱讀短文，回答問題。'],
  ],
  SEC_PER_ITEM: 72,
  PLAY_LIMIT: 2,
  // Ujian penuh = persis naskah resmi Band A: 聽力 25/15/5/5 & 閱讀 15/15/10/5/5 (Part 4 = 5 titik kosong),
  // dua tes terpisah masing-masing 60 menit; setelah masuk 閱讀 tidak bisa kembali ke 聽力.
  FULL: [25, 15, 5, 5, 15, 15, 10, 5, 5],
  FULL_SEC: 3600,

  partOf(t) { return this.PARTS.findIndex(p => t.part.startsWith(p[0])); },
  // Sumber soal ujian volume: bank soal Tes Bab bila bab itu sudah punya; bila belum, soal latihan modul
  bank(vol) {
    const out = [];
    for (const m of App.volData[vol].modules) (App.bank[m.code] || m.tasks).forEach(t => out.push({ t, code: m.code }));
    return out;
  },
  nBank(vol) { return App.volData[vol].modules.filter(m => App.bank[m.code]).length; },
  history(vol) { return (Store.get(UJIAN_KEY, {})[vol] || []); },

  menu(vol) {
    const bank = this.bank(vol), h = this.history(vol), s = this.session;
    const avail = this.PARTS.map((p, i) => bank.filter(x => this.partOf(x.t) === i).length);
    const fullOk = this.FULL.every((c, i) => (i === 7 ? bank.filter(x => this.partOf(x.t) === 7).reduce((a, x) => a + x.t.answers.length, 0) : avail[i]) >= c);
    const running = s && s.vol === vol && s.phase !== 'result';
    return `
      <div class="panel exam">
        <div class="panel-k">${Pic.html('📝', 'ic-sm')} ${T('Just like the real exam', 'Seperti ujian sungguhan')}</div>
        <p>${LANG === 'id' ? `Soal diambil acak dari ${bank.length} soal di ${App.volData[vol].modules.length} modul volume ini${this.nBank(vol) ? ` (${this.nBank(vol)} bab memakai bank soal Tes Bab)` : ''}, disusun menurut urutan bagian TOCFL: <b lang="zh-TW">聽力</b> dulu, lalu <b lang="zh-TW">閱讀</b>.
        Ada batas waktu, audio maksimal diputar ${this.PLAY_LIMIT}×, dan jawaban baru dinilai setelah kamu mengumpulkan.`
        : `Questions are drawn at random from ${bank.length} questions in the ${App.volData[vol].modules.length} modules of this volume${this.nBank(vol) ? ` (${this.nBank(vol)} units use the unit-test question bank)` : ''}, ordered by TOCFL section: <b lang="zh-TW">聽力</b> first, then <b lang="zh-TW">閱讀</b>.
        There is a time limit, audio can be played at most ${this.PLAY_LIMIT}×, and answers are only scored after you submit.`}</p>
      </div>
      ${running ? `<button class="card continue" onclick="App.go('#/ujian')">${Pic.html('⏱️', 'mode-ic')}
          <div class="continue-txt"><small>${T('Exam in progress', 'Ujian sedang berjalan')}</small><b>${T('Continue · question', 'Lanjutkan · soal')} ${s.i + 1}/${s.items.length}</b></div><span class="chev">›</span></button>` : ''}
      <div class="mode-list">
        ${[[20, T('Short exam', 'Ujian singkat')], [40, T('Long exam', 'Ujian lengkap')]].map(([n, l]) => `
        <button class="card mode-card" onclick="Ujian.start(${vol}, ${n})">
          ${Pic.html(n === 20 ? '⏱️' : '🏁', 'mode-ic')}
          <div><b>${l} · ${n} ${T('questions', 'soal')}</b><span>± ${Math.round(n * this.SEC_PER_ITEM / 60)} ${T('min', 'menit')} · ${n / 2} 聽力 + ${n / 2} 閱讀</span></div><span class="chev">›</span></button>`).join('')}
        ${fullOk ? `<button class="card mode-card" onclick="Ujian.start(${vol}, 'full')">
          ${Pic.html('🎓', 'mode-ic')}
          <div><b>${T('Full exam · official format', 'Ujian penuh · format resmi')}</b><span>${T('<span lang="zh-TW">聽力</span> 50 questions · 60 min, then <span lang="zh-TW">閱讀</span> 50 questions · 60 min — the same number of questions per part as the TOCFL Band A paper', '<span lang="zh-TW">聽力</span> 50 soal · 60 menit, lalu <span lang="zh-TW">閱讀</span> 50 soal · 60 menit — jumlah soal tiap bagian persis naskah TOCFL Band A')}</span></div><span class="chev">›</span></button>` : ''}
      </div>
      <details class="panel"><summary class="panel-k">${T('Question bank by part', 'Bank soal per bagian')}</summary>
        <ul class="partlist">${this.PARTS.map((p, i) => `<li><span lang="zh-TW">${p[0]}</span> ${p[2]}<b>${avail[i]}</b></li>`).join('')}</ul></details>
      ${h.length ? `<h3 class="sub-title">${T('History', 'Riwayat')}</h3>
        <div class="hist">${h.slice(-8).reverse().map(x => `<div class="hrow">
          <span>${new Date(x.d).toLocaleDateString(Lang.LOCALE, { day: 'numeric', month: 'short' })}</span>
          <span>${x.n} ${T('q.', 'soal')}</span><span>聽 ${x.l}%</span><span>閱 ${x.r}%</span><b>${x.pct}%</b></div>`).join('')}</div>` : ''}`;
  },

  /* Susun paket: bagi n/2 聽力 & n/2 閱讀 menurut bobot; kekurangan di satu bagian dialihkan ke bagian lain */
  compose(vol, n) {
    const bank = shuffle(this.bank(vol));
    const byPart = this.PARTS.map((_, i) => bank.filter(x => this.partOf(x.t) === i));
    const pick = this.PARTS.map(() => 0);
    for (const [idx, total] of [[[0, 1, 2, 3], n / 2], [[4, 5, 6, 7, 8], n / 2]]) {
      const w = idx.reduce((a, i) => a + this.PARTS[i][1], 0);
      idx.forEach(i => (pick[i] = Math.min(byPart[i].length, Math.round(total * this.PARTS[i][1] / w))));
      let left = total - idx.reduce((a, i) => a + pick[i], 0);
      while (left > 0) {
        const i = idx.filter(i => pick[i] < byPart[i].length).sort((a, b) => (byPart[b].length - pick[b]) - (byPart[a].length - pick[a]))[0];
        if (i == null) break;
        pick[i]++; left--;
      }
      while (left < 0) { const i = idx.filter(i => pick[i] > 0).sort((a, b) => pick[b] - pick[a])[0]; pick[i]--; left++; }
    }
    return byPart.flatMap((list, i) => list.slice(0, pick[i]));
  },
  /* Paket ujian penuh: jumlah tiap bagian persis FULL; Part 4 diisi paragraf sampai 5 titik kosong */
  composeFull(vol) {
    const bank = shuffle(this.bank(vol));
    return this.PARTS.flatMap((_, i) => {
      const list = bank.filter(x => this.partOf(x.t) === i);
      if (i !== 7) return list.slice(0, this.FULL[i]);
      const out = [];
      let b = 0;
      for (const x of list.sort((p, q) => q.t.answers.length - p.t.answers.length))
        if (b + x.t.answers.length <= this.FULL[7]) { out.push(x); b += x.t.answers.length; }
      return out;
    });
  },
  start(vol, n) {
    clearInterval(this.timer);
    const full = n === 'full', items = full ? this.composeFull(vol) : this.compose(vol, n);
    Soal.plays = {}; Soal.limit = this.PLAY_LIMIT;
    this.session = { kind: 'vol', vol, items, i: 0, answers: {}, intro: {}, phase: 'q', dur: full ? this.FULL_SEC : items.length * this.SEC_PER_ITEM, end: null, grid: false,
                     title: `${full ? T('Full exam', 'Ujian penuh') : T('Exam', 'Ujian')} · Vol.${vol}`, back: `#/v/${vol}/ujian` };
    if (full) Object.assign(this.session, { full: true, sec: 0, r0: items.findIndex(x => this.partOf(x.t) >= 4), usedPrev: 0 });
    App.go('#/ujian');
  },
  // Ujian penuh: nomor & daftar soal per tes (聽力 1–50, 閱讀 1–50), seperti dua naskah terpisah
  range() {
    const s = this.session, n = s.items.length;
    if (!s.full) return [0, n];
    return s.sec ? [s.r0, n] : [0, s.r0];
  },
  w(t) { return this.session.full && t.type === 'cloze' ? t.answers.length : 1; },
  // Nomor soal (1-based) seperti di naskah; paragraf Part 4 memakai rentang nomor, mis. 41–45
  num(i) {
    const s = this.session, a = this.range()[0];
    const k = 1 + s.items.slice(a, i).reduce((x, y) => x + this.w(y.t), 0), w = this.w(s.items[i].t);
    return w > 1 ? `${k}–${k + w - 1}` : `${k}`;
  },
  total() { const s = this.session, [a, b] = this.range(); return s.items.slice(a, b).reduce((x, y) => x + this.w(y.t), 0); },
  elapsed() { const s = this.session; return s.end ? Math.min(s.dur, Math.round((Date.now() - (s.end - s.dur * 1000)) / 1000)) : 0; },
  toReading() {
    const s = this.session;
    s.usedPrev = this.elapsed(); s.sec = 1; s.end = null; s.dur = this.FULL_SEC;
    clearInterval(this.timer);
    Speech.stop(); s.i = s.r0; s.grid = false; this.render(); window.scrollTo(0, 0);
  },
  startTes(code) {
    clearInterval(this.timer);
    const f = App.findModule(code), items = (App.bank[code] || []).map(t => ({ t, code }));
    if (!items.length) return App.toast(T('This unit has no unit test yet.', 'Bab ini belum punya Tes Bab.'));
    Soal.plays = {}; Soal.limit = this.PLAY_LIMIT;
    this.session = { kind: 'tes', code, vol: f.vol, items, i: 0, answers: {}, intro: {}, phase: 'q', dur: items.length * this.SEC_PER_ITEM, end: null, grid: false,
                     title: `${T('Unit test', 'Tes Bab')} · ${code}`, back: `#/m/${code}/5` };
    App.go('#/ujian');
  },

  render() {
    const s = this.session;
    if (s.phase === 'result') return this.result();
    Soal.limit = this.PLAY_LIMIT;
    const it = s.items[s.i], pi = this.partOf(it.t);
    if (!s.intro[pi]) return this.partIntro(pi);
    if (!s.end) s.end = Date.now() + s.dur * 1000;
    this.tick();
    const key = 'u' + s.i, [a, b] = this.range(), n = b - a;
    App.bar(s.title, s.back, `<span class="bar-pill timer" id="ujian-timer"></span>`);
    this.tick();
    App.main(`
      <div class="lprog"><i style="width:${this.nAnswered() / n * 100}%"></i></div>
      <div class="exam-top"><span lang="zh-TW">${esc(this.PARTS[pi][0])} · ${this.PARTS[pi][2]}</span>
        <button class="btn small ghost" onclick="Ujian.toggleGrid()">${T('Q', 'Soal')} ${this.num(s.i)}/${this.total()} ▾</button></div>
      ${s.grid ? this.grid() : ''}
      <div class="q-card">${Soal.body(it.t, key, s.answers[key], 'Ujian', 'exam')}</div>
      <div class="dock">
        <button class="btn ghost" ${s.i === a ? 'disabled' : ''} onclick="Ujian.goto(${s.i - 1})">‹ ${T('Previous', 'Sebelumnya')}</button>
        ${s.i + 1 < b ? `<button class="btn primary" onclick="Ujian.goto(${s.i + 1})">${T('Next', 'Berikutnya')} ›</button>`
          : s.full && !s.sec ? `<button class="btn primary" onclick="Ujian.submitListening()">${T('Finish 聽力', 'Selesai 聽力')} ›</button>`
          : `<button class="btn primary" onclick="Ujian.submit()">${T('Submit', 'Kumpulkan')}</button>`}
      </div>`);
    Speech.preloadTask(it.t); Speech.preloadTask(s.items[s.i + 1]?.t);
  },
  partIntro(pi) {
    const s = this.session, p = this.PARTS[pi];
    Speech.preloadTask(s.items[s.i].t);
    const fi = s.items.findIndex(x => this.partOf(x.t) === pi);
    const first = +this.num(fi).split('–')[0];
    const cnt = s.items.filter(x => this.partOf(x.t) === pi).reduce((a, x) => a + this.w(x.t), 0);
    App.bar(s.title, s.back, s.end ? `<span class="bar-pill timer" id="ujian-timer"></span>` : '');
    this.tick();
    App.main(`
      <div class="part-intro">
        ${Pic.html(pi < 4 ? '🎧' : '📖', 'pic-xl')}
        <h2 lang="zh-TW">${p[0].replace(/Part (\d)/, '第$1部分')}</h2>
        <b>${p[2]}</b>
        <p class="zh-instr" lang="zh-TW">說明：${p[4]}</p>
        <p>${p[3]}</p>
        <small>${T('Questions', 'Soal')} ${first}–${first + cnt - 1} · ${cnt} ${T('questions', 'soal')}${pi < 4 ? ` · ${T('audio max.', 'audio maks.')} ${this.PLAY_LIMIT}×` : ''}</small>
        ${!s.end ? `<p class="hint">${T(`The timer (${Math.round(s.dur / 60)} min${s.full ? ` for all of ${pi < 4 ? '聽力' : '閱讀'}` : ''}) starts when you press Start.`, `Waktu (${Math.round(s.dur / 60)} menit${s.full ? ` untuk seluruh ${pi < 4 ? '聽力' : '閱讀'}` : ''}) mulai berjalan saat kamu menekan Mulai.`)}</p>` : ''}
        <button class="btn primary block" onclick="Ujian.session.intro[${pi}]=true;Ujian.render()">${s.end ? T('Continue', 'Lanjut') : T('Start', 'Mulai')}</button>
      </div>`);
  },
  tick() {
    const s = this.session;
    clearInterval(this.timer);
    if (!s || !s.end || s.phase === 'result') return;
    const upd = () => {
      const left = Math.max(0, Math.round((s.end - Date.now()) / 1000));
      const el = document.getElementById('ujian-timer');
      if (el) { el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; el.classList.toggle('low', left < 120); }
      if (left === 0) {
        clearInterval(this.timer);
        if (s.full && !s.sec) { App.toast(T('聽力 time is up — moving on to 閱讀.', 'Waktu 聽力 habis — lanjut ke 閱讀.')); return this.toReading(); }
        App.toast(T('Time is up — your answers have been submitted.', 'Waktu habis — jawaban dikumpulkan.')); this.finish();
      }
    };
    upd(); this.timer = setInterval(upd, 1000);
  },
  nAnswered() { const s = this.session, [a, b] = this.range(); return s.items.slice(a, b).filter((x, k) => this.done(x.t, s.answers['u' + (a + k)])).length; },
  done(t, a) { return t.type === 'cloze' ? !!(a && t.answers.every((_, k) => a.vals[k] != null)) : a != null; },
  grid() {
    const s = this.session;
    const [a, b] = this.range();
    return `<div class="qgrid">${s.items.slice(a, b).map((x, k) => { const i = a + k; return `<button class="${i === s.i ? 'cur' : ''} ${this.done(x.t, s.answers['u' + i]) ? 'ok' : ''}" onclick="Ujian.goto(${i})">${this.num(i)}</button>`; }).join('')}</div>`;
  },
  toggleGrid() { this.session.grid = !this.session.grid; this.render(); },
  goto(i) { Speech.stop(); this.session.i = i; this.session.grid = false; this.render(); window.scrollTo(0, 0); },
  pick(key, oi) { this.session.answers[key] = oi; this.keep(); },
  clozeSel(key, k) { this.session.answers[key] = Soal.clozeSel(this.session.answers[key], k); this.keep(); },
  clozeFill(key, oi) { this.session.answers[key] = Soal.clozeFill(Soal.reg[key], this.session.answers[key], oi); this.keep(); },
  keep() { const y = window.scrollY; this.render(); window.scrollTo(0, y); },
  submitListening() {
    const [a, b] = this.range(), left = b - a - this.nAnswered();
    if (!confirm(LANG === 'id' ? `${left ? `Masih ada ${left} soal 聽力 belum dijawab. ` : ''}Lanjut ke 閱讀? Setelah itu kamu tidak bisa kembali ke 聽力.`
      : `${left ? `${left} 聽力 question(s) still unanswered. ` : ''}Go on to 閱讀? You will not be able to return to 聽力.`)) return;
    this.toReading();
  },
  submit() {
    const [a, b] = this.range(), left = b - a - this.nAnswered();
    if (left && !confirm(T(`${left} question(s) still unanswered. Submit now?`, `Masih ada ${left} soal belum dijawab. Kumpulkan sekarang?`))) return;
    this.finish();
  },

  finish() {
    const s = this.session;
    clearInterval(this.timer);
    Speech.stop();
    const per = this.PARTS.map(() => [0, 0]);
    s.items.forEach((x, i) => { const [g, n] = Soal.score(x.t, s.answers['u' + i]); const p = per[this.partOf(x.t)]; p[0] += g; p[1] += n; });
    const sum = arr => arr.reduce((a, [g, n]) => [a[0] + g, a[1] + n], [0, 0]);
    const pc = ([g, n]) => n ? Math.round(g / n * 100) : 0;
    s.per = per; s.pct = pc(sum(per)); s.l = pc(sum(per.slice(0, 4))); s.r = pc(sum(per.slice(4)));
    s.used = (s.usedPrev || 0) + this.elapsed();
    s.phase = 'result'; s.filter = 'salah';
    if (s.kind === 'tes') {
      const t = App.getP(s.code).tes || {};
      App.setP(s.code, { tes: { last: s.pct, best: Math.max(s.pct, t.best ?? 0), tries: (t.tries || 0) + 1 } });
    } else {
      const all = Store.get(UJIAN_KEY, {});
      (all[s.vol] = all[s.vol] || []).push({ d: Date.now(), n: s.items.length, pct: s.pct, l: s.l, r: s.r });
      Store.set(UJIAN_KEY, all);
    }
    App.go('#/ujian');
  },
  result() {
    const s = this.session;
    Soal.limit = null;
    App.bar(`${T('Results', 'Hasil')} · ${s.title}`, s.back);
    const wrongCodes = [...new Set(s.items.filter((x, i) => { const [g, n] = Soal.score(x.t, s.answers['u' + i]); return g < n; }).map(x => x.code))];
    const list = s.items.map((x, i) => ({ x, i, ok: (([g, n]) => g === n)(Soal.score(x.t, s.answers['u' + i])) }))
      .filter(r => s.filter === 'semua' || !r.ok);
    App.main(`
      <div class="result ${s.pct >= 80 ? 'hi' : s.pct >= 60 ? 'mid' : 'lo'}">
        ${App.ring(s.pct, s.pct + '%', 'ring-lg')}
        <p>${T(`Time used: ${Math.floor(s.used / 60)} min ${s.used % 60} s.`, `Waktu terpakai ${Math.floor(s.used / 60)} menit ${s.used % 60} detik.`)}</p>
        <div class="stats3 two">
          <div>${App.ring(s.l, s.l + '%')}<small lang="zh-TW">聽力</small></div>
          <div>${App.ring(s.r, s.r + '%')}<small lang="zh-TW">閱讀</small></div>
        </div>
      </div>
      <h3 class="sub-title">${T('By part', 'Per bagian')}</h3>
      <div class="partbars">${this.PARTS.map((p, i) => s.per[i][1] ? `<div class="pb">
          <span lang="zh-TW">${p[0]}</span><div class="bar"><i style="width:${s.per[i][0] / s.per[i][1] * 100}%"></i></div><b>${s.per[i][0]}/${s.per[i][1]}</b></div>` : '').join('')}</div>
      <p class="hint">${T('In 閱讀 Part 4, each blank counts as one point, just like in the official exam.', 'Di 閱讀 Part 4, setiap titik kosong dihitung satu poin, sama seperti di ujian resmi.')}</p>
      ${s.kind === 'vol' && wrongCodes.length ? `<div class="panel"><div class="panel-k">${T('Modules to review', 'Modul yang perlu diulang')}</div>
        <div class="chips">${wrongCodes.map(c => `<button class="chip" onclick="App.go('#/m/${c}/0')">${c} <span lang="zh-TW">${esc(App.findModule(c).m.title)}</span></button>`).join('')}</div></div>` : ''}
      <div class="toolbar"><h3 class="sub-title">${T('Review questions', 'Tinjau soal')}</h3><span class="spacer"></span>
        <div class="seg">${[['salah', T('Wrong only', 'Yang salah')], ['semua', T('All', 'Semua')]].map(([k, l]) => `<button class="${s.filter === k ? 'on' : ''}" onclick="Ujian.session.filter='${k}';Ujian.keep()">${l}</button>`).join('')}</div></div>
      ${list.map(({ x, i }) => `<div class="q-card review">
          <div class="q-part"><b>${i + 1}.</b> <span lang="zh-TW">${esc(x.t.part)}</span> · <a href="#/m/${x.code}/0">${x.code}</a></div>
          ${Soal.body(x.t, 'r' + i, s.answers['u' + i], 'Ujian', 'review')}</div>`).join('') || `<p class="hint">${T('No wrong answers.', 'Tidak ada soal yang salah.')} 太棒了！</p>`}
      <div class="row2"><button class="btn primary" onclick="${s.kind === 'tes' ? `Ujian.startTes('${s.code}')">${T('Retake test', 'Ulangi tes')}` : `Ujian.start(${s.vol}, ${s.full ? "'full'" : s.items.length})">${T('New exam', 'Ujian baru')}`}</button>
        <button class="btn ghost" onclick="App.go('${s.back}')">${T('Done', 'Selesai')}</button></div>`);
  },
};
