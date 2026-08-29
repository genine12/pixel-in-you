// 사운드 엔진 — 음원 파일 없이 Web Audio API 로 실시간 합성
//  · BGM: 테마 2종 (앰비언트 드론 / 리퀴드 D&B) 무한 루프
//  · SFX: 저음역 사이버 콘솔 효과음
// 설정 > SOUND 에서 테마 선택 + 두 슬라이더(0~5)로 음량 조절, 0 이면 정지

const LEVEL_GAIN = [0, .05, .09, .14, .2, .28];   // BGM 슬라이더 0~5 → 마스터 게인
const SFX_GAIN   = [0, .1, .2, .32, .46, .62];   // SFX 슬라이더 0~5 → 효과음 버스 게인
const LOOKAHEAD  = 0.14;                          // 스케줄 선반영 구간(초)

const midi = n => 440 * Math.pow(2, (n - 69) / 12);  // MIDI 노트 → Hz

// ── BGM 테마 ─────────────────────────────────────────────
// bars: 마디별 { bass: 서브베이스 루트, pad: 패드 보이싱 } · drum: null 이면 드럼 없음
export const TRACKS = [
  {
    id: 'drone', name: 'DRONE', desc: '드럼 없는 앰비언트',
    bpm: 56, swing: 0, reverb: .68, hiss: .016,
    // D 리디안 — 아주 느린 2코드 왕복
    bars: [
      { bass: 38, pad: [50, 54, 57, 61, 64] }, // Dmaj9
      { bass: 38, pad: [50, 54, 57, 61, 64] },
      { bass: 38, pad: [50, 54, 57, 61, 66] },
      { bass: 38, pad: [50, 54, 57, 61, 66] },
      { bass: 35, pad: [47, 50, 54, 59, 61] }, // Bm9
      { bass: 35, pad: [47, 50, 54, 59, 61] },
      { bass: 35, pad: [47, 50, 54, 57, 61] },
      { bass: 35, pad: [47, 50, 54, 57, 61] },
    ],
    pad:  { type: 'sawtooth', gain: .21, attack: 2.6, cutoff: [300, 880], wobble: .3, drift: .3 },
    sub:  { gain: .46, steps: [0] },
    drum: null,
  },
  {
    id: 'signal', name: 'SIGNAL', desc: '셔플 브레이크 · 리퀴드 D&B',
    bpm: 172, swing: .15, reverb: .34, hiss: .012,
    // F# 마이너 — 9th 보이싱
    bars: [
      { bass: 42, pad: [54, 57, 61, 64, 68] }, // F#m9
      { bass: 42, pad: [54, 57, 61, 64, 68] },
      { bass: 38, pad: [50, 54, 57, 61, 64] }, // Dmaj9
      { bass: 38, pad: [50, 54, 57, 61, 64] },
      { bass: 47, pad: [59, 62, 66, 69, 73] }, // Bm9
      { bass: 47, pad: [59, 62, 66, 69, 73] },
      { bass: 40, pad: [52, 56, 59, 62, 66] }, // E9
      { bass: 40, pad: [52, 56, 59, 62, 66] },
    ],
    pad:  { type: 'sawtooth', gain: .11, attack: .9, cutoff: [700, 1500], wobble: 0, drift: 0 },
    sub:  { gain: .42, steps: [0, 10] },
    // kickAlt: 2마디마다 킥이 한 번 더 들어가는 변주
    drum: { gain: 1, kick: [0, 10], kickAlt: [0, 6, 10], snare: [4, 12], ghost: [7, 14],
            hat: { div: 2, prob: .45, gain: .18 } },
  },
];

let ctx = null, master = null, wet = null, dry = null, analyser = null, noiseBuf = null;
let comp = null, sfxBus = null, sfxLevel = 4, hissGain = null, sfxEcho = null;
let timer = null, nextTime = 0, step = 0, bar = 0;
let level = 0, trackIx = 0, armed = false, running = false;

const T = () => TRACKS[trackIx];
const stepDur = () => 60 / T().bpm / 4;   // 16분음표 길이(초)

// ── 셋업 ─────────────────────────────────────────────────
function build() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0;                       // 페이드인으로 올림
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3.2; comp.release.value = .3;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const hp = ctx.createBiquadFilter();         // 초저역(럼블) 정리
  hp.type = 'highpass'; hp.frequency.value = 28;
  master.connect(hp); hp.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);

  dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);

  // 효과음 버스 — BGM 마스터와 독립 (BGM 음소거 상태에서도 SFX 는 들린다)
  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_GAIN[sfxLevel];
  sfxBus.connect(comp);

  // 짧은 피드백 딜레이 — 함교 통신음 같은 잔향
  sfxEcho = ctx.createDelay(.6);
  sfxEcho.delayTime.value = .15;
  const echoLP = ctx.createBiquadFilter();
  echoLP.type = 'lowpass'; echoLP.frequency.value = 2800;
  const echoFB = ctx.createGain(); echoFB.gain.value = .32;
  sfxEcho.connect(echoLP); echoLP.connect(echoFB); echoFB.connect(sfxEcho);
  echoLP.connect(sfxBus);

  // 절차 생성 임펄스 리스폰스 리버브 (넓은 공기감)
  const rev = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 3.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  rev.buffer = ir;
  const revLP = ctx.createBiquadFilter();      // 리버브 고역 정리 — 테이프 느낌
  revLP.type = 'lowpass'; revLP.frequency.value = 3200;
  wet = ctx.createGain(); wet.gain.value = T().reverb;
  wet.connect(revLP); revLP.connect(rev); rev.connect(master);

  // 노이즈 버퍼 (하이햇/스네어/테이프 히스 공용)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  tapeHiss();
}

// 아주 낮은 테이프 히스 — CRT 험과 어울리는 바닥 질감
function tapeHiss() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = .5;
  hissGain = ctx.createGain(); hissGain.gain.value = T().hiss;
  src.connect(bp); bp.connect(hissGain); hissGain.connect(dry);
  src.start();
}

// ── 음색 ─────────────────────────────────────────────────
// 패드: 디튠 오실레이터 + 로우패스. wobble 은 필터 LFO, drift 는 테이프 피치 흔들림
function pad(t, notes, dur, P) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(P.gain, t + P.attack);
  g.gain.setTargetAtTime(0, t + dur * .72, .6);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(P.cutoff[0], t);
  lp.frequency.linearRampToValueAtTime(P.cutoff[1], t + dur * .6);
  lp.frequency.linearRampToValueAtTime(P.cutoff[0], t + dur);
  lp.Q.value = .7;

  if (P.wobble) {                              // 필터가 천천히 흔들리는 신스 질감
    const lfo = ctx.createOscillator();
    lfo.frequency.value = .1 + Math.random() * .12;
    const lg = ctx.createGain();
    lg.gain.value = P.cutoff[1] * P.wobble;
    lfo.connect(lg); lg.connect(lp.frequency);
    lfo.start(t); lfo.stop(t + dur + 1.6);
  }

  notes.forEach((n, i) => {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : P.type;
      o.frequency.value = midi(n);
      o.detune.value = det;
      if (P.drift) {                           // 테이프 피치 드리프트
        const d = ctx.createOscillator();
        d.type = 'sine'; d.frequency.value = .06 + Math.random() * .07;
        const dg = ctx.createGain(); dg.gain.value = 16 * P.drift;
        d.connect(dg); dg.connect(o.detune);
        d.start(t); d.stop(t + dur + 1.6);
      }
      const v = ctx.createGain();
      v.gain.value = (i === 0 ? .5 : .28) / notes.length;
      o.connect(v); v.connect(lp);
      o.start(t); o.stop(t + dur + 1.4);
    }
  });
  lp.connect(g); g.connect(dry); g.connect(wet);
}

// 서브베이스: 사인 + 짧은 글라이드
function sub(t, note, dur, vol) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(midi(note) * .94, t);
  o.frequency.exponentialRampToValueAtTime(midi(note), t + .07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .03);
  g.gain.setTargetAtTime(0, t + dur * .5, .22);
  o.connect(g); g.connect(dry);
  o.start(t); o.stop(t + dur + .6);
}

function kick(t, v = 1) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(124, t);
  o.frequency.exponentialRampToValueAtTime(41, t + .12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(.78 * v, t);
  g.gain.exponentialRampToValueAtTime(.001, t + .36);
  o.connect(g); g.connect(dry);
  o.start(t); o.stop(t + .38);
}

function snare(t, v = 1) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = .7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(.36 * v, t);
  ng.gain.exponentialRampToValueAtTime(.001, t + .18);
  n.connect(bp); bp.connect(ng); ng.connect(dry); ng.connect(wet);
  n.start(t); n.stop(t + .22);

  const o = ctx.createOscillator();          // 바디
  o.type = 'triangle'; o.frequency.setValueAtTime(184, t);
  const og = ctx.createGain();
  og.gain.setValueAtTime(.2 * v, t);
  og.gain.exponentialRampToValueAtTime(.001, t + .11);
  o.connect(og); og.connect(dry);
  o.start(t); o.stop(t + .13);
}

function hat(t, v = 1) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  n.playbackRate.value = 1.6;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 6800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(.001, t + .05);
  n.connect(hp); hp.connect(g); g.connect(dry);
  n.start(t); n.stop(t + .1);
}

// ── 콘솔 효과음 (SFX) ────────────────────────────────────
// 우주선 콘솔 톤 — 기본 음역은 낮게 두되 레조넌트 필터 스윕과 에코로 공간감을 만든다
// (막힌 소리를 피하려고 로우패스는 넉넉히 열고, 날카로움은 파형과 감쇠로 잡는다)

// 공용 출력: 게인 → (에코 send) → 버스
function out(t, node, vol, dur, { send = 0, echo = 0 } = {}) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .006);
  g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  node.connect(g); g.connect(sfxBus);
  if (echo > 0 && sfxEcho) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e); e.connect(sfxEcho); }
  if (send > 0 && wet) { const w = ctx.createGain(); w.gain.value = send; g.connect(w); w.connect(wet); }
  return g;
}

// 오실레이터 톤 — cutoff/q 로 밝기와 울림을 조절
function tone(t, f0, f1, dur, { type = 'triangle', vol = 1, glide = .35,
                                cutoff = 4200, q = 1, send = 0, echo = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * glide);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = q;
  o.connect(lp);
  out(t, lp, vol, dur, { send, echo });
  o.start(t); o.stop(t + dur + .05);
}

// 레조넌트 필터 스윕 — SF 콘솔 특유의 "지잉" 하는 질감
function zap(t, f0, f1, dur, { vol = 1, q = 9, type = 'sawtooth', cut0 = 300, cut1 = 3600,
                               send = 0, echo = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * .8);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = q;
  lp.frequency.setValueAtTime(cut0, t);
  lp.frequency.exponentialRampToValueAtTime(cut1, t + dur * .7);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, cut0), t + dur);
  o.connect(lp);
  out(t, lp, vol, dur, { send, echo });
  o.start(t); o.stop(t + dur + .05);
}

// 링모듈레이션 — 금속성 경보 톤
function ring(t, f, mod, dur, { vol = 1, echo = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = mod;
  const ml = ctx.createGain(); ml.gain.value = 1;
  const cell = ctx.createGain(); cell.gain.value = 0;
  m.connect(ml); ml.connect(cell.gain); o.connect(cell);
  out(t, cell, vol, dur, { echo });
  o.start(t); o.stop(t + dur + .05);
  m.start(t); m.stop(t + dur + .05);
}

function noiseSweep(t, f0, f1, dur, vol = 1, q = 3, { echo = 0, send = 0 } = {}) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  n.connect(bp);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * .2);
  g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  bp.connect(g); g.connect(sfxBus);
  if (echo > 0 && sfxEcho) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e); e.connect(sfxEcho); }
  if (send > 0 && wet) { const w = ctx.createGain(); w.gain.value = send; g.connect(w); w.connect(wet); }
  n.start(t); n.stop(t + dur + .05);
}

const VOICES = {
  // 하단 탭바 이동 — 짧게 위로 튀는 통신 chirp (다른 조작과 확실히 구분)
  nav: t => { tone(t, 392, 587, .1, { vol: .62, glide: .6, cutoff: 6000, echo: .3 });
              tone(t + .05, 587, 784, .14, { vol: .5, glide: .5, cutoff: 6800, echo: .34 }); },
  // 일반 조작(토글·리스트·뒤로) — 낮고 짧은 콘솔 스위치
  tap: t => { zap(t, 220, 165, .085, { vol: .32, q: 7, cut0: 700, cut1: 4600, echo: .18 });
              tone(t, 1568, 1568, .03, { type: 'sine', vol: .1, cutoff: 7000 }); },
  // 주요 버튼(CTA) — 두툼한 저역 + 위로 열리는 스윕
  confirm: t => { tone(t, 82, 82, .18, { type: 'sine', vol: .3, cutoff: 900 });
                  zap(t, 147, 294, .26, { vol: .26, q: 10, cut0: 420, cut1: 5200, echo: .3, send: .2 }); },
  // 사진 투입 영역 터치 — 공기가 빨려 들어가는 인테이크
  intake: t => { noiseSweep(t, 260, 4600, .42, .3, 1.1, { echo: .22 });
                 tone(t, 110, 220, .4, { type: 'sawtooth', vol: .2, glide: .85, cutoff: 3600 }); },
  // 알림
  blip: t => tone(t, 330, 440, .13, { vol: .24, glide: .4, cutoff: 5200, echo: .3, send: .2 }),
  // 사진 분석 — 길게 훑고 지나가는 스캐너
  scan: t => { zap(t, 82, 330, .8, { vol: .22, q: 13, cut0: 240, cut1: 4200, echo: .3, send: .25 });
               noiseSweep(t, 300, 5200, .8, .16, 1.4, { echo: .2 }); },
  // 판정 통과 — 밝게 열리는 상승 2음
  ok: t => { tone(t, 294, 294, .15, { vol: .34, cutoff: 5600, echo: .3, send: .3 });
             tone(t + .11, 440, 440, .36, { vol: .34, cutoff: 6800, echo: .38, send: .35 }); },
  // 판정 반려 — 눌러 내려가는 경보
  reject: t => { zap(t, 220, 82, .38, { vol: .3, q: 11, cut0: 2600, cut1: 500, echo: .25 });
                 ring(t + .04, 165, 31, .3, { vol: .12 }); },
  // 셀 정착 — 저역 임팩트 + 상승 하모닉
  commit: t => { tone(t, 73, 73, .34, { type: 'sine', vol: .32, cutoff: 800 });
                 [147, 220, 330].forEach((f, i) =>
                   tone(t + .06 + i * .085, f, f, i === 2 ? .5 : .14,
                        { vol: .3, cutoff: 6800, echo: .35, send: .4 })); },
  // 리빌 — 바닥에서 함교 전체가 차오르는 스윕
  reveal: t => { zap(t, 55, 660, 2.3, { vol: .28, q: 12, cut0: 200, cut1: 6000, echo: .45, send: .6 });
                 noiseSweep(t, 200, 6000, 2.3, .16, 1.1, { echo: .3, send: .4 }); },
  // 오류 — 금속성 경보 2연타
  error: t => { ring(t, 110, 44, .26, { vol: .3, echo: .25 });
                ring(t + .2, 92, 37, .3, { vol: .28, echo: .25 });
                tone(t, 440, 415, .22, { type: 'square', vol: .07, cutoff: 3400, echo: .2 }); },
};

export const sfx = {
  // 효과음 재생. 사용자 제스처 안에서 호출되면 오디오 컨텍스트도 함께 열린다
  play(name) {
    if (!sfxLevel || !VOICES[name]) return;
    build();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume?.();
    try { VOICES[name](ctx.currentTime + .005); } catch { /* 노드 생성 실패는 무시 */ }
  },
  setLevel(v) {
    sfxLevel = Math.max(0, Math.min(5, v | 0));
    if (sfxBus) sfxBus.gain.setTargetAtTime(SFX_GAIN[sfxLevel], ctx.currentTime, .02);
  },
  level: () => sfxLevel,
};

// ── 시퀀서 ───────────────────────────────────────────────
function scheduleStep(s, t) {
  const tr = T();
  const chord = tr.bars[bar % tr.bars.length];
  const dur = stepDur();

  if (s === 0) pad(t, chord.pad, dur * 16, tr.pad);
  if (tr.sub.steps.includes(s)) sub(t, chord.bass, dur * (s === 0 ? 6 : 4), tr.sub.gain);

  const D = tr.drum;
  if (!D) return;
  const varied = bar % 4 >= 2;                  // 2마디마다 살짝 변주
  const kk = (varied && D.kickAlt) ? D.kickAlt : D.kick;
  if (kk.includes(s)) kick(t, (s === 0 ? 1 : .82) * D.gain);
  if (D.snare.includes(s)) snare(t, D.gain);
  if (varied && D.ghost.includes(s)) snare(t, .22 * D.gain);
  if (s % D.hat.div === 0) hat(t, D.hat.gain * (s % 8 === 0 ? 1 : .7));
  else if (Math.random() < D.hat.prob) hat(t, D.hat.gain * .4);
}

function tick() {
  if (!running) return;
  const dur = stepDur(), sw = T().swing;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(step, nextTime + (step % 2 === 1 ? dur * sw : 0));
    nextTime += dur;
    step += 1;
    if (step >= 16) { step = 0; bar += 1; }
  }
}

// ── 공개 API ─────────────────────────────────────────────
function fade(to, sec = 2.2) {
  if (!master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(to, t + sec);
}

function play(fadeSec = 3) {
  if (!ctx || running || !level) return;
  running = true;
  step = 0; bar = 0;
  nextTime = ctx.currentTime + .12;
  tick();
  timer = setInterval(tick, 25);
  fade(LEVEL_GAIN[level], fadeSec);
}

function stop(sec = 1.2) {
  if (!running) return;
  running = false;
  clearInterval(timer); timer = null;
  fade(0, sec);
}

// 테마별 공간감/바닥 노이즈 반영
function applyTrackMix() {
  if (!ctx) return;
  const t = ctx.currentTime;
  wet?.gain.setTargetAtTime(T().reverb, t, .3);
  hissGain?.gain.setTargetAtTime(T().hiss, t, .3);
}

export const bgm = {
  // 첫 사용자 제스처에서 호출 — 자동재생 정책상 여기서만 컨텍스트를 열 수 있다
  arm() {
    if (armed) return;
    armed = true;
    build();
    if (!ctx) return;
    ctx.resume?.();
    applyTrackMix();
    if (level) play();
  },
  // 0~5 단계. 0 이면 정지, 재생 중이면 즉시 음량 반영
  setLevel(v) {
    level = Math.max(0, Math.min(5, v | 0));
    if (!armed || !ctx) return;
    if (!level) { stop(); return; }
    if (!running) play(1.2); else fade(LEVEL_GAIN[level], .4);
  },
  // 테마 전환 — 페이드아웃 후 새 테마로 재시작
  setTrack(i) {
    const ix = TRACKS[i | 0] ? (i | 0) : 0;    // 없는 인덱스(테마 구성 변경)는 기본 테마로
    if (ix === trackIx) return;
    trackIx = ix;
    if (!armed || !ctx) return;
    applyTrackMix();
    if (!level) return;                        // 음소거 상태면 다음 재생 때 반영
    if (!running) { play(1.6); return; }       // 멈춰 있었다면 새 테마로 바로 시작
    stop(.4);                                  // 재생 중이면 크로스페이드로 교체
    setTimeout(() => { if (level && !running) play(1.6); }, 420);
  },
  track: () => trackIx,
  level: () => level,
  isPlaying: () => running,
  // 현재 출력 진폭(0~1) — 디버그/레벨 미터용
  peak() {
    if (!analyser) return 0;
    const d = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(d);
    let m = 0;
    for (const v of d) m = Math.max(m, Math.abs(v - 128) / 128);
    return m;
  },
  // 대역별 세기(0~1) n개 — 스펙트럼 미터/디버그용
  bands(n = 8) {
    if (!analyser) return new Array(n).fill(0);
    const d = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(d);
    const per = Math.floor(d.length / n);
    return Array.from({ length: n }, (_, i) => {
      let sum = 0;
      for (let j = 0; j < per; j++) sum += d[i * per + j];
      return +(sum / per / 255).toFixed(3);
    });
  },
};

// 백그라운드로 가면 정지 (배터리) — 돌아오면 설정대로 복귀
document.addEventListener('visibilitychange', () => {
  if (!armed || !ctx) return;
  if (document.hidden) stop(.4);
  else if (level) { ctx.resume?.(); play(1.2); }
});
