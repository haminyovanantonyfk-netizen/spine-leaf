/* SpineLeaf — sentence engine + read-aloud player.
   Sentence splitting is grapheme-safe (Intl.Segmenter where available).
   Speech uses the device's own voices (speechSynthesis). Document text is
   never sent to any cloud speech service. */
'use strict';
const SLSent = (() => {
  const ML_RE = /[\u0D00-\u0D7F]/;
  function splitSentences(text) {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const seg = new Intl.Segmenter(undefined, { granularity: 'sentence' });
        return [...seg.segment(clean)].map(s => s.segment.trim()).filter(Boolean);
      } catch (e) { /* fall through */ }
    }
    // Fallback: split after sentence enders (incl. Malayalam usage of '.'),
    // keeping the ender attached; safe for grapheme clusters since we never
    // split inside a code-point sequence.
    const out = [];
    const re = /[^.!?…]+[.!?…]+["”']?\s*|[^.!?…]+$/g;
    let m;
    while ((m = re.exec(clean)) !== null) { const s = m[0].trim(); if (s) out.push(s); }
    return out.length ? out : [clean];
  }
  function langOf(text) { return ML_RE.test(text) ? 'ml-IN' : 'en-IN'; }
  return { splitSentences, langOf, ML_RE };
})();

const SLTTS = (() => {
  const synth = window.speechSynthesis || null;
  let queue = [];        // [{text, pageIdx, sentIdx}]
  let pos = -1;          // index into queue
  let playing = false;
  let rate = 1;
  let voicePref = 'auto'; // 'auto' | 'ml-IN' | 'en-IN' | 'en-US'
  let sleepTimer = null;
  let onEvent = () => {};
  let generation = 0;     // guards against stale utterance callbacks

  function voices() { return synth ? synth.getVoices() : []; }
  function pickVoice(lang) {
    const vs = voices();
    if (!vs.length) return null;
    const want = voicePref !== 'auto' ? voicePref : lang;
    const norm = s => (s || '').toLowerCase().replace('_', '-');
    let v = vs.find(v => norm(v.lang) === norm(want));
    if (!v) v = vs.find(v => norm(v.lang).startsWith(norm(want).slice(0, 2)));
    if (!v && want.startsWith('ml')) return null; // honest missing-voice state
    if (!v) v = vs.find(v => norm(v.lang).startsWith('en')) || vs[0];
    return v;
  }
  function hasMalayalamVoice() { return voices().some(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith('ml')); }
  function hasAnyVoice() { return voices().length > 0; }

  function speakCurrent() {
    if (!synth || pos < 0 || pos >= queue.length) { stop(false); return; }
    const item = queue[pos];
    const gen = ++generation;
    const u = new SpeechSynthesisUtterance(item.text);
    const lang = voicePref !== 'auto' ? voicePref : SLSent.langOf(item.text);
    u.lang = lang;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => {
      if (gen !== generation) return;
      pos++;
      if (pos >= queue.length) { stop(false); onEvent({ type: 'done' }); }
      else { onEvent({ type: 'sentence', item: queue[pos], index: pos }); speakCurrent(); }
    };
    u.onerror = ev => {
      if (gen !== generation) return;
      if (ev.error === 'interrupted' || ev.error === 'canceled') return;
      pos++;
      if (pos >= queue.length) { stop(false); onEvent({ type: 'done' }); }
      else speakCurrent();
    };
    onEvent({ type: 'sentence', item, index: pos });
    synth.speak(u);
  }
  function load(items, startAt = 0) {
    stop(false);
    queue = items; pos = startAt;
  }
  function play() {
    if (!synth) { onEvent({ type: 'error', message: 'Speech is not available on this device/browser.' }); return; }
    if (pos < 0) pos = 0;
    if (pos >= queue.length) { onEvent({ type: 'done' }); return; }
    playing = true;
    if (synth.paused) synth.resume(); else speakCurrent();
    onEvent({ type: 'state', playing: true });
  }
  function pause() { if (synth) synth.pause(); playing = false; onEvent({ type: 'state', playing: false }); }
  function resume() { if (synth && synth.paused) { synth.resume(); playing = true; onEvent({ type: 'state', playing: true }); } else play(); }
  function stop(notify = true) {
    generation++;
    if (synth) synth.cancel();
    playing = false;
    if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
    if (notify) onEvent({ type: 'state', playing: false });
  }
  function jump(delta) {
    if (!queue.length) return;
    const wasPlaying = playing || (synth && synth.speaking);
    generation++;
    if (synth) synth.cancel();
    pos = Math.max(0, Math.min(queue.length - 1, pos + delta));
    if (wasPlaying) { playing = true; speakCurrent(); }
    else onEvent({ type: 'sentence', item: queue[pos], index: pos });
  }
  function setSleep(minutes) {
    if (sleepTimer) clearTimeout(sleepTimer);
    if (minutes > 0) sleepTimer = setTimeout(() => stop(), minutes * 60000);
  }
  return {
    load, play, pause, resume, stop, jump, setSleep,
    setRate: r => { rate = r; },
    setVoicePref: v => { voicePref = v; },
    setOnEvent: fn => { onEvent = fn; },
    voices, hasMalayalamVoice, hasAnyVoice,
    get playing() { return playing; },
    get position() { return pos; },
    get queueLength() { return queue.length; },
    current: () => (pos >= 0 && pos < queue.length ? queue[pos] : null)
  };
})();
if (window.speechSynthesis) speechSynthesis.getVoices(); // warm up voice list
