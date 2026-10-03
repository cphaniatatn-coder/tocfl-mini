/* Media: audio (mp3 → TTS), gambar SVG (Twemoji, CC-BY 4.0), avatar pembicara, ilustrasi adegan.
   Prinsip Mayer: gambar hanya dipakai bila menunjang makna (coherence), bukan hiasan. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ===== Audio =====
   Rekaman Mandarin Taiwan (zh-TW, Microsoft Neural) dibuat oleh _kerja/buat_audio.py.
   - Nama file = cyrb53("PROFIL|teks") → dihitung langsung di sini, tidak perlu memuat daftar audio.
   - Suara mengikuti pembicara (SPEAKERS di bawah, juga dibaca oleh buat_audio.py).
   - Audio di layar yang sedang dibuka dipra-muat, dan klip yang sudah dimuat dipakai ulang,
     supaya tombol audio langsung berbunyi.
   Cadangan bila rekaman tidak ada: suara browser zh-TW sesuai jenis kelamin. */
/* SPEAKERS */ const SPEAKERS = {
  "李美美": "F1", "小姐": "F1", "店員": "F1", "老闆娘": "F1", "護士": "F1", "陳安安": "F1", "女": "F1",
  "安妮": "F2", "陳老師": "F2", "媽媽": "F2", "美美的媽媽": "F2",
  "王大文": "M1", "王先生": "M1", "先生": "M1", "陳先生": "M1", "司機": "M1", "男": "M1",
  "志明": "M2", "老闆": "M2", "醫生": "M2",
  "小明": "K", "安妮的弟弟": "K"
};

const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

let _voiceF = null, _voiceM = null;
if (window.speechSynthesis) {
  const pick = () => {
    const tw = speechSynthesis.getVoices().filter(v => /zh[-_]TW/i.test(v.lang));
    _voiceF = tw.find(v => /hsiaochen|hsiaoyu|hanhan|yating|mei-?jia|female/i.test(v.name)) || tw[0] || null;
    _voiceM = tw.find(v => /yunjhe|zhiwei|male/i.test(v.name) && !/female/i.test(v.name)) || null;
  };
  pick();
  speechSynthesis.addEventListener('voiceschanged', pick);
}

const Speech = {
  cache: new Map(), cur: null, token: 0, MAX: 80,
  // Kecepatan putar untuk audio panjang (dialog); disimpan per pengguna. Nada tetap (preservesPitch).
  RATES: [0.6, 0.8, 1, 1.2],
  rate: (() => { try { return +localStorage.getItem('tocflmini_speed') || 1; } catch { return 1; } })(),
  setRate(r) {
    this.rate = r;
    try { localStorage.setItem('tocflmini_speed', r); } catch { /* mode privat */ }
    if (this.cur) this.cur.playbackRate = r;
    document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('on', +b.dataset.r === r));
  },
  speedUI() {
    return `<div class="speed" role="group" aria-label="${T('Audio speed', 'Kecepatan audio')}"><span>${T('Speed', 'Kecepatan')}</span>${this.RATES.map(r =>
      `<button data-r="${r}" class="${r === this.rate ? 'on' : ''}" onclick="event.stopPropagation();Speech.setRate(${r})">${LANG === 'id' ? String(r).replace('.', ',') : r}×</button>`).join('')}</div>`;
  },
  profil(sp) { return SPEAKERS[sp] || 'F1'; },
  url(text, prof) { return `audio/tts/${cyrb53(`${prof}|${String(text).trim()}`).toString(36)}.mp3`; },
  // Ambil (atau buat) elemen audio; preload=auto → browser mulai mengunduh sekarang
  el(text, prof) {
    const u = this.url(text, prof);
    let a = this.cache.get(u);
    if (a) { this.cache.delete(u); this.cache.set(u, a); return a; }   // tandai baru dipakai
    a = new Audio(); a.preload = 'auto'; a.src = u; a._u = u;
    this.cache.set(u, a);
    if (this.cache.size > this.MAX) this.cache.delete(this.cache.keys().next().value);
    return a;
  },
  // Pra-muat daftar [teks, profil] di latar belakang
  preload(list) { list.forEach(([t, p]) => t && this.el(t, p)); },
  preloadLines(lines) { this.preload((lines || []).map(l => [l.zh, this.profil(l.sp)])); },
  preloadTask(t) {
    if (!t) return;
    if (t.audio) this.preload([[t.audio, 'N']]);
    if (t.type === 'listen_pic') this.preload(Soal.picTexts(t).map(x => [x, 'N']));
    this.preloadLines(t.lines);
  },
  stop() {
    this.token++;
    if (this.cur) { this.cur.pause(); this.cur = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
  play(text, prof, token) {
    return new Promise(done => {
      if (token !== this.token) return done();
      const a = this.el(text, prof);
      this.cur = a;
      const selesai = () => { a.onended = a.onerror = null; done(); };
      a.onended = selesai;
      a.onerror = () => { a.onended = a.onerror = null; this.cache.delete(a._u); this.tts(text, prof).then(done); };
      try { a.currentTime = 0; } catch { /* belum ada metadata */ }
      a.playbackRate = this.rate; a.preservesPitch = true;
      const p = a.play();
      if (p) p.catch(e => { if (e.name !== 'AbortError') { a.onended = a.onerror = null; this.tts(text, prof).then(done); } });
    });
  },
  tts(text, prof) {
    return new Promise(done => {
      if (!window.speechSynthesis) { App.toast(T('Audio is not available for this sentence yet.', 'Audio belum tersedia untuk kalimat ini.')); return done(); }
      const male = /^M|^K/.test(prof);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW'; u.rate = 0.9 * this.rate;
      const v = male ? (_voiceM || _voiceF) : _voiceF;
      if (v) u.voice = v;
      u.pitch = male && !_voiceM ? 0.7 : prof === 'K' ? 1.3 : 1;
      u.onend = u.onerror = () => done();
      speechSynthesis.speak(u);
    });
  },
  word(text) { this.stop(); this.play(text, 'W', this.token); },
  say(text, onend) { this.stop(); this.play(text, 'N', this.token).then(() => onend && onend()); },
  // 聽力 Part 1: pertanyaan lalu pilihan A/B/C, dengan jeda seperti rekaman ujian
  async seq(texts, onend) {
    this.stop();
    const t = this.token;
    this.preload(texts.map(x => [x, 'N']));
    for (const [i, x] of texts.entries()) {
      if (t !== this.token) return;
      await this.play(x, 'N', t);
      await new Promise(r => setTimeout(r, i === 0 ? 650 : 350));   // + 250 ms hening awal di tiap rekaman
    }
    if (t === this.token && onend) onend();
  },
  // Dialog: baris berurutan, masing-masing dengan suara pembicaranya
  async lines(lines, onend) {
    this.stop();
    const t = this.token;
    this.preloadLines(lines);
    for (const l of lines) {
      if (t !== this.token) return;
      await this.play(l.zh, this.profil(l.sp), t);
      // tanpa jeda tambahan: hening akhir (150 ms) + hening awal klip berikutnya (250 ms) sudah jadi jeda giliran bicara
    }
    if (t === this.token && onend) onend();
  },
};

/* ===== Gambar (Twemoji SVG lokal) ===== */
const Pic = {
  MOD: new Set([0x200d, 0xfe0f, 0x20e3]),
  clusters(s) {
    const out = []; let cur = '', join = false;
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      const isMod = this.MOD.has(cp) || (cp >= 0x1f3fb && cp <= 0x1f3ff);
      // bendera = sepasang huruf regional indicator (🇹 + 🇼 → 🇹🇼)
      const ri = x => x >= 0x1f1e6 && x <= 0x1f1ff, flag = ri(cp) && [...cur].length === 1 && ri(cur.codePointAt(0));
      if (cur && (isMod || join || flag)) cur += ch; else { if (cur) out.push(cur); cur = ch; }
      join = cp === 0x200d;
    }
    if (cur) out.push(cur);
    return out;
  },
  isEmoji(c) {
    const cp = c.codePointAt(0);
    return cp >= 0x2190 && !(cp >= 0x3000 && cp <= 0x9fff) && !(cp >= 0xff00 && cp <= 0xffef);
  },
  code(c) {
    if (!c.includes('‍')) c = c.replace(/️/g, '');
    return [...c].map(x => x.codePointAt(0).toString(16)).join('-');
  },
  // Ubah string emoji (bisa gabungan, mis. "📚⬆") menjadi deretan <img> SVG.
  // bw = versi hitam-putih (OpenMoji, img/bw/) untuk gambar soal ala TOCFL; kotak warna tetap berwarna.
  html(s, cls = '', bw = false) {
    return this.clusters(s || '').map(c => {
      if (!this.isEmoji(c)) return `<span class="tw-txt">${esc(c)}</span>`;
      const k = this.code(c), hp = bw && !this.isSwatch(c);
      const fallback = hp ? `this.onerror=()=>this.replaceWith(document.createTextNode('${c}'));this.classList.remove('bw');this.src='img/twemoji/${k}.svg'`
                          : `this.replaceWith(document.createTextNode('${c}'))`;
      return `<img class="tw ${cls}${this.isSwatch(c) ? ' tw-sw' : ''}${hp ? ' bw' : ''}" src="img/${hp ? 'bw' : 'twemoji'}/${k}.svg" alt="" draggable="false" onerror="${fallback}">`;
    }).join('');
  },
  // Kotak warna (🟥⬜⬛…) dipakai sebagai penanda warna benda di sebelahnya → digambar kecil
  isSwatch(c) { const cp = c.codePointAt(0); return (cp >= 0x1f7e5 && cp <= 0x1f7eb) || cp === 0x2b1b || cp === 0x2b1c; },
  // Gambar soal: beberapa ikon disusun sebaris, makin banyak makin kecil
  group(s, cls, bw = false) {
    const n = this.clusters(s || '').filter(c => this.isEmoji(c) && !this.isSwatch(c)).length;
    return `<span class="pic-row n${Math.min(n, 4)}">${this.html(s, cls, bw)}</span>`;
  },

  /* Avatar pembicara — memberi 'wajah' pada suara (dual-coding), konsisten di seluruh modul */
  AVATAR: {
    '王大文': '🧑', '李美美': '👩', '安妮': '👧', '志明': '👨', '陳老師': '👩‍🏫', '陳先生': '👨‍💼', '王先生': '👨‍💼',
    '先生': '👨‍💼', '小姐': '👩‍💼', '店員': '👩‍💼', '老闆': '🧔', '老闆娘': '👩‍🦱', '醫生': '🧑‍⚕️', '護士': '👩‍⚕️',
    '媽媽': '👩‍🦳', '美美的媽媽': '👩‍🦳', '房東': '🧓', '陳安安': '🧑‍🎓', '小明': '👦', '安妮的弟弟': '👦',
    '司機': '🧑‍✈️', '男': '👨', '女': '👩',
  },
  avatar(sp) { return this.html(this.AVATAR[sp] || '🧑', 'avatar'); },

  /* Ilustrasi adegan per 情境類別: latar sederhana (SVG buatan sendiri) + 2 ikon penanda situasi */
  SCENE: {
    1: ['🪪', '👋', '#FDE8D7', '#F6B98E'], 2: ['🏠', '🛋️', '#E6F0E6', '#9CC59C'], 3: ['💼', '🏢', '#E7ECF4', '#9DB0CF'],
    4: ['⚽', '🎬', '#FFF1CC', '#F2C94C'], 5: ['🚆', '🗺️', '#E3F2F7', '#86C3D7'], 6: ['🤝', '💬', '#F4E6F2', '#D39BCB'],
    7: ['🩺', '💊', '#FBE3E3', '#EE9A9A'], 8: ['🏫', '📚', '#E9E6F7', '#A99BDB'], 9: ['🛍️', '💳', '#FDEBDD', '#F4A96A'],
    10: ['🍜', '🥢', '#FFF0DD', '#F0B36B'], 11: ['🏦', '📮', '#E2EEF0', '#8FB9BF'], 12: ['🚨', '⚠️', '#FCE5DC', '#E98E6B'],
    13: ['⛰️', '🌳', '#E1F2E6', '#7CC49A'], 14: ['🌏', '♻️', '#E4EFE9', '#8EBFA5'], 15: ['🧧', '🏮', '#FBE2DF', '#E0827A'],
    16: ['😊', '💭', '#FFF4D6', '#F1CF6B'], 17: ['📱', '💻', '#E4EAF5', '#93A6CC'],
  },
  catNum(cat) { return parseInt(String(cat), 10) || 1; },
  scene(cat, size = 'lg') {
    const [a, b, bg, fg] = this.SCENE[this.catNum(cat)] || this.SCENE[1];
    return `<div class="scene scene-${size}" style="--scene-bg:${bg};--scene-fg:${fg}">
      <svg class="scene-bgsvg" viewBox="0 0 200 90" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 62 Q50 44 100 58 T200 52 V90 H0 Z" fill="var(--scene-fg)" opacity=".55"/>
        <path d="M0 74 Q60 60 120 72 T200 68 V90 H0 Z" fill="var(--scene-fg)" opacity=".85"/>
        <circle cx="168" cy="20" r="9" fill="#fff" opacity=".7"/>
      </svg>
      <div class="scene-icons">${this.html(a, 'scene-ic')}${this.html(b, 'scene-ic scene-ic2')}</div>
    </div>`;
  },
};
