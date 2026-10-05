/* Bahasa antarmuka modul mini: Indonesia · English · Tiếng Việt, dipilih peserta di layar pertama
   (tersimpan per perangkat: localStorage tocflmini_lang). Teks antarmuka di JS ditulis T('English', 'Indonesia');
   versi Vietnam dicari di VI_UI (js/vi.js, dibuat _kerja/buat_mini.py dari _kerja/mini/ui_vi.json) memakai teks
   English sebagai kunci — termasuk pola dengan {0} {1} untuk teks yang berisi angka/nilai.
   Data isi per bahasa: data/id/, data/en/, data/vi/. */

// File data/ diberi ?v=<versi> (window.DATA_V di index.html, dari buat_mini.py): GitHub Pages meng-cache 10 menit,
// tanpa ini peserta bisa masih melihat kuesioner/soal lama setelah diperbarui.
if (window.DATA_V) { const _fetch = window.fetch.bind(window); window.fetch = (u, o) => _fetch(typeof u === 'string' && u.startsWith('data/') ? `${u}?v=${window.DATA_V}` : u, o); }

const LANG_KEY = 'tocflmini_lang';
const LANG_PILIH = (() => { try { const l = localStorage.getItem(LANG_KEY); return ['id', 'en', 'vi'].includes(l) ? l : null; } catch { return null; } })();
const LANG = LANG_PILIH || 'en';
document.documentElement.lang = LANG;

const Lang = {
  dipilih: !!LANG_PILIH,
  DATA: `data/${LANG}/`,
  LOCALE: { id: 'id-ID', en: 'en-GB', vi: 'vi-VN' }[LANG],
  is() { return false; },
  pilih(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* mode privat */ } location.replace(location.pathname + '#/'); location.reload(); },
  ganti() { try { localStorage.removeItem(LANG_KEY); } catch { /* */ } location.replace(location.pathname + '#/'); location.reload(); },
  _pola: null,
  vi(en) {
    const V = window.VI_UI || {};
    if (V[en] != null) return V[en];
    if (!this._pola) this._pola = Object.keys(V).filter(k => k.includes('{0}')).map(k => {
      const re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d)\}/g, '([\\s\\S]*?)') + '$');
      const urut = [...k.matchAll(/\{(\d)\}/g)].map(m => +m[1]);
      return [re, urut, V[k]];
    });
    for (const [re, urut, vi] of this._pola) {
      const m = en.match(re);
      if (m) return vi.replace(/\{(\d)\}/g, (_, d) => m[1 + urut.indexOf(+d)] ?? '');
    }
    return en;
  },
};
const T = (en, id) => (LANG === 'id' ? id : LANG === 'vi' ? Lang.vi(en) : en);
