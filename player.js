// The production log's video player: its own controls for FYR's gameplay video in the theatre on the front page (log.js
// opens it), in place of the browser's. No third-party code; build.mjs copies this file into the site as it is, and
// log.js loads it on the first sign of interest in the video. The theatre keeps its start and end screens; while the
// video plays, the player shows a scrubber (buffered range, hover time), play and pause, volume, captions it draws
// itself (styled, and lifted above the controls) when the video has a captions track, full screen for the whole screen
// of the theatre, keyboard shortcuts, a quality menu, and controls that step aside while the picture plays.
// The pure helpers are exported for the tests (player.test.mjs); nothing here touches the page until mountPlayer runs.

export const SEEK_STEP = 5;
export const IDLE_MS = 2600;

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

// 0:07, 1:05, 1:02:03. Unknown or negative times read 0:00.
export function formatTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Where a pointer at clientX falls along a track that starts at left, as 0..1.
export const fractionAt = (clientX, left, width) => (width > 0 ? clamp((clientX - left) / width) : 0);

// The end of the buffered range that holds time t, in seconds; 0 while t is not buffered.
export function bufferedEnd(ranges, t) {
  for (let i = 0; i < ranges.length; i++) if (ranges.start(i) <= t + 0.5 && t <= ranges.end(i)) return ranges.end(i);
  return 0;
}

export const volumeLevel = (volume, muted) => (muted || volume === 0 ? 'off' : volume < 0.5 ? 'low' : 'high');

// Cue text without WebVTT tags, one line per active cue.
export const cueText = (cues) => cues.map((cue) => cue.text.replace(/<[^>]*>/g, '')).join('\n');

// ---- quality: the video can come in several heights (<source data-height data-mbps>), and the player picks one

// The versions from the <source> elements' src, height and mbps (average megabits a second), tallest first. A source
// without a height is not a version.
export function readVersions(sources) {
  return sources
    .map((s) => ({ src: s.src, height: Number(s.height), mbps: Number(s.mbps) || 0 }))
    .filter((v) => v.src && v.height > 0)
    .sort((a, b) => b.height - a.height);
}

// The picture rows on screen while the video plays: the theatre shows the whole picture then (object-fit: contain; the
// cover crop is only for the poster), so the box's height or its width at the video's shape, whichever is less, times
// the screen's pixel density.
export const rowsNeeded = (width, height, dpr = 1, aspect = 16 / 9) => Math.ceil(Math.min(height, width / aspect) * (dpr || 1));

// The version to play: the smallest that fills the rows on screen (up to 5% enlargement does not show), then lower
// while the connection is known to be too slow for it. Data saver and 2G or 3G get the smallest. Chrome reports at most
// 10 Mbps, so 10 means "10 or more"; other browsers report nothing.
export function pickVersion(versions, { rows = 0, saveData = false, downlink, effectiveType } = {}) {
  if (!versions.length) return null;
  const up = [...versions].sort((a, b) => a.height - b.height);
  if (saveData || /(^|-)[23]g$/.test(effectiveType ?? '')) return up[0];
  let i = up.findIndex((v) => v.height >= rows * 0.95);
  if (i < 0) i = up.length - 1;
  if (Number.isFinite(downlink) && downlink > 0 && downlink < 10) while (i > 0 && up[i].mbps > downlink * 0.75) i -= 1;
  return up[i];
}

// Whether playback waited too much to keep the version it plays: one wait of more than 3 s, or a second wait within
// 30 s. stalls: [{ at, ms }], ms null while the wait goes on; times in milliseconds.
export function tooManyStalls(stalls, now) {
  const recent = stalls.filter((s) => now - s.at <= 30000);
  return recent.length >= 2 || recent.some((s) => (s.ms ?? now - s.at) > 3000);
}

// The keyboard shortcuts of the big video sites. Returns null for keys the player leaves to the page.
export function shortcut({ key, ctrlKey, metaKey, altKey }) {
  if (ctrlKey || metaKey || altKey) return null;
  const k = key.length === 1 ? key.toLowerCase() : key;
  switch (k) {
    case ' ':
    case 'k':
      return { name: 'toggle' };
    case 'ArrowLeft':
      return { name: 'seek', by: -SEEK_STEP };
    case 'ArrowRight':
      return { name: 'seek', by: SEEK_STEP };
    case 'j':
      return { name: 'seek', by: -2 * SEEK_STEP };
    case 'l':
      return { name: 'seek', by: 2 * SEEK_STEP };
    case 'ArrowUp':
      return { name: 'volume', by: 0.1 };
    case 'ArrowDown':
      return { name: 'volume', by: -0.1 };
    case 'm':
      return { name: 'mute' };
    case 'f':
      return { name: 'fullscreen' };
    case 'c':
      return { name: 'captions' };
    case 'Home':
      return { name: 'jump', to: 0 };
    case 'End':
      return { name: 'jump', to: 1 };
    default:
      return /^[0-9]$/.test(k) ? { name: 'jump', to: Number(k) / 10 } : null;
  }
}

const icon = (name, body) => `<svg class="player-icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const SPEAKER = '<path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z"/>';
const ICONS = {
  play: icon('play', '<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: icon('pause', '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'),
  high: icon('high', `${SPEAKER}<path class="line" d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8"/>`),
  low: icon('low', `${SPEAKER}<path class="line" d="M15.2 9.2a4 4 0 0 1 0 5.6"/>`),
  off: icon('off', `${SPEAKER}<path class="line" d="M16 9.5l5 5M21 9.5l-5 5"/>`),
  captions: icon('captions', '<rect class="line" x="3" y="5.5" width="18" height="13" rx="2.5"/><path class="line" d="M7 12.5h4M13 12.5h4M7 15.5h6"/>'),
  enter: icon('enter', '<path class="line" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  exit: icon('exit', '<path class="line" d="M9 4v5H4M15 4v5h5M15 20v-5h5M9 20v-5H4"/>'),
};

const SLIDER_PARTS = '<div class="player-track"><div class="player-fill player-buffered"></div><div class="player-fill player-hover"></div><div class="player-fill player-played"></div></div><div class="player-rail"><div class="player-thumb"></div></div>';

const LAYER = `
  <div class="player-captions" aria-hidden="true" hidden><span></span></div>
  <div class="player-spinner" hidden></div>
  <p class="player-message" role="alert" hidden>The video could not load. Check your connection, then reload the page.</p>
  <div class="player-bar" role="group" aria-label="Video controls">
    <div class="player-slider player-scrub" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00">
      ${SLIDER_PARTS}
      <div class="player-tip" aria-hidden="true">0:00</div>
    </div>
    <div class="player-row">
      <button class="player-button player-toggle" type="button" aria-label="Play">${ICONS.play}${ICONS.pause}</button>
      <div class="player-volume">
        <button class="player-button player-mute" type="button" aria-label="Mute">${ICONS.high}${ICONS.low}${ICONS.off}</button>
        <div class="player-slider player-level" role="slider" tabindex="0" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-valuetext="100%">${SLIDER_PARTS}</div>
      </div>
      <p class="player-time"><span class="player-now">0:00</span><span class="player-of"> / <span class="player-total">0:00</span></span></p>
      <div class="player-quality" hidden>
        <button class="player-button player-quality-button" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Quality"><span class="player-quality-label"></span></button>
        <div class="player-menu" role="menu" aria-label="Quality" hidden></div>
      </div>
      <button class="player-button player-cc" type="button" aria-label="Captions" aria-pressed="false">${ICONS.captions}</button>
      <button class="player-button player-full" type="button" aria-label="Full screen">${ICONS.enter}${ICONS.exit}</button>
    </div>
  </div>`;

// A horizontal slider driven by pointer drags and the keyboard; get and set work in 0..1.
function slider(el, { get, set, step, page, begin, end }) {
  const track = el.querySelector('.player-track');
  const at = (x) => {
    const r = track.getBoundingClientRect();
    return fractionAt(x, r.left, r.width);
  };
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = e.pointerId;
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
    begin?.();
    set(at(e.clientX));
  });
  el.addEventListener('pointermove', (e) => {
    if (drag === e.pointerId) set(at(e.clientX));
  });
  const stop = (e) => {
    if (drag !== e.pointerId) return;
    drag = null;
    el.classList.remove('is-dragging');
    end?.();
  };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('keydown', (e) => {
    const moves = { ArrowLeft: -step(), ArrowDown: -step(), ArrowRight: step(), ArrowUp: step(), PageDown: -page, PageUp: page };
    let to;
    if (e.key in moves) to = get() + moves[e.key];
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    set(clamp(to));
  });
}

// Takes over the video in root (the element that goes full screen: the video, its captions and the controls).
// Returns { activate, deactivate, focus }: the page activates the player when the video starts and deactivates it
// when its own end screen takes over.
export function mountPlayer(root, video) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  video.controls = false;
  root.classList.add('player');
  root.tabIndex = -1;
  const holder = doc.createElement('div');
  holder.innerHTML = LAYER;
  root.append(...holder.children);

  const $ = (selector) => root.querySelector(selector);
  const bar = $('.player-bar');
  const scrub = $('.player-scrub');
  const level = $('.player-level');
  const tip = $('.player-tip');
  const toggle = $('.player-toggle');
  const mute = $('.player-mute');
  const cc = $('.player-cc');
  const full = $('.player-full');
  const now = $('.player-now');
  const total = $('.player-total');
  const captions = $('.player-captions');
  const captionText = $('.player-captions span');
  const spinner = $('.player-spinner');
  const message = $('.player-message');
  const canHover = view.matchMedia('(hover: hover)').matches;
  const setVar = (el, name, value) => el.style.setProperty(name, String(value));
  const duration = () => (Number.isFinite(video.duration) ? video.duration : 0);

  let active = false;
  let scrubbing = false;
  let scrubTo = 0;
  let resumeAfterScrub = false;
  let raf = 0;
  let seekFrame = 0;
  let idleTimer = 0;
  let spinTimer = 0;
  let lastPointer = 'mouse';
  let shown = '';
  let menuOpen = false;

  // ---- time, progress and buffer
  function paint() {
    const d = duration();
    const t = scrubbing ? scrubTo * d : video.currentTime;
    setVar(scrub, '--played', d ? clamp(t / d) : 0);
    const text = `${formatTime(t)}|${formatTime(d)}`;
    if (text === shown) return;
    shown = text;
    const [nowText, totalText] = text.split('|');
    now.textContent = nowText;
    total.textContent = totalText;
    scrub.setAttribute('aria-valuemax', String(Math.floor(d)));
    scrub.setAttribute('aria-valuenow', String(Math.floor(t)));
    scrub.setAttribute('aria-valuetext', `${nowText} of ${totalText}`);
  }
  const paintBuffer = () => {
    const d = duration();
    setVar(scrub, '--buffered', d ? clamp(bufferedEnd(video.buffered, video.currentTime) / d) : 0);
  };
  function loop() {
    paint();
    raf = video.paused ? 0 : view.requestAnimationFrame(loop);
  }
  for (const type of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked']) video.addEventListener(type, paint);
  for (const type of ['progress', 'timeupdate']) video.addEventListener(type, paintBuffer);

  // ---- controls that step aside while the picture plays
  const keyboardInBar = () => Boolean(bar.querySelector(':focus-visible'));
  function wake() {
    root.classList.remove('is-idle');
    view.clearTimeout(idleTimer);
    if (active && !video.paused) idleTimer = view.setTimeout(rest, IDLE_MS);
  }
  function rest() {
    if (!active || video.paused || scrubbing || menuOpen || (canHover && bar.matches(':hover')) || keyboardInBar()) return wake();
    root.classList.add('is-idle');
  }
  root.addEventListener('pointermove', (e) => {
    if (active && e.pointerType === 'mouse') wake();
  });
  root.addEventListener('pointerleave', (e) => {
    if (!active || e.pointerType !== 'mouse' || video.paused || scrubbing) return;
    view.clearTimeout(idleTimer);
    idleTimer = view.setTimeout(rest, 700);
  });
  root.addEventListener('focusin', () => {
    if (active) wake();
  });

  // ---- play and pause; a click on the picture toggles it, a tap shows or hides the controls
  function togglePlay() {
    if (video.paused || video.ended) video.play().catch(() => {});
    else video.pause();
  }
  function syncPlay() {
    root.dataset.paused = String(video.paused);
    toggle.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
    if (!video.paused && !raf) raf = view.requestAnimationFrame(loop);
    wake();
  }
  video.addEventListener('play', syncPlay);
  video.addEventListener('pause', syncPlay);
  toggle.addEventListener('click', togglePlay);
  video.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
  });
  video.addEventListener('click', () => {
    if (!active) return;
    if (lastPointer === 'mouse') {
      togglePlay();
      wake();
    } else if (root.classList.contains('is-idle') || video.paused) wake();
    else root.classList.add('is-idle');
  });
  video.addEventListener('dblclick', () => {
    if (active && lastPointer === 'mouse') toggleFull();
  });

  // ---- loading and errors
  function spin(on) {
    view.clearTimeout(spinTimer);
    if (on) spinTimer = view.setTimeout(() => (spinner.hidden = !active), 300);
    else spinner.hidden = true;
  }
  video.addEventListener('waiting', () => spin(true));
  for (const type of ['playing', 'canplay', 'pause', 'seeked', 'ended']) video.addEventListener(type, () => spin(false));
  const fail = () => {
    spin(false);
    message.hidden = false;
  };
  video.addEventListener('error', fail);
  video.querySelector('source:last-of-type')?.addEventListener('error', fail);

  // ---- seeking: drag pauses the picture and resumes it on release; hovering shows the time under the pointer
  const seekNow = () => {
    seekFrame = 0;
    const t = scrubTo * duration();
    if (video.fastSeek) video.fastSeek(t);
    else video.currentTime = t;
  };
  slider(scrub, {
    get: () => (duration() ? video.currentTime / duration() : 0),
    set: (f) => {
      if (!duration()) return;
      if (scrubbing) {
        scrubTo = f;
        if (!seekFrame) seekFrame = view.requestAnimationFrame(seekNow);
      } else video.currentTime = f * duration();
      paint();
    },
    step: () => (duration() ? SEEK_STEP / duration() : 0),
    page: 0.1,
    begin: () => {
      scrubbing = true;
      resumeAfterScrub = !video.paused;
      video.pause();
    },
    end: () => {
      scrubbing = false;
      view.cancelAnimationFrame(seekFrame);
      seekFrame = 0;
      if (duration()) video.currentTime = scrubTo * duration();
      if (resumeAfterScrub) video.play().catch(() => {});
      wake();
    },
  });
  function showTip(x) {
    const r = scrub.querySelector('.player-track').getBoundingClientRect();
    const f = fractionAt(x, r.left, r.width);
    const half = tip.offsetWidth / 2;
    setVar(scrub, '--hover', f);
    setVar(scrub, '--tip-x', `${clamp(f * r.width, half, Math.max(half, r.width - half))}px`);
    tip.textContent = formatTime(f * duration());
  }
  scrub.addEventListener('pointerdown', (e) => showTip(e.clientX));
  scrub.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || scrubbing) showTip(e.clientX);
  });
  scrub.addEventListener('pointerleave', () => setVar(scrub, '--hover', 0));

  // ---- volume (the slider only where there is a mouse; phones use their buttons)
  slider(level, {
    get: () => (video.muted ? 0 : video.volume),
    set: (f) => {
      video.volume = f;
      video.muted = f === 0;
    },
    step: () => 0.05,
    page: 0.2,
  });
  mute.addEventListener('click', () => {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 0.6;
    } else video.muted = true;
  });
  function syncVolume() {
    const heard = video.muted ? 0 : video.volume;
    const percent = Math.round(heard * 100);
    root.dataset.volume = volumeLevel(video.volume, video.muted);
    setVar(level, '--played', heard);
    level.setAttribute('aria-valuenow', String(percent));
    level.setAttribute('aria-valuetext', `${percent}%`);
    mute.setAttribute('aria-label', root.dataset.volume === 'off' ? 'Unmute' : 'Mute');
  }
  video.addEventListener('volumechange', syncVolume);

  // ---- captions: the track stays hidden from the browser; the player draws the active cue itself
  const track = [...video.textTracks].find((t) => t.kind === 'captions' || t.kind === 'subtitles');
  let captionsOn = Boolean(video.querySelector('track[default]'));
  function drawCaptions() {
    const text = track?.activeCues ? cueText([...track.activeCues]) : '';
    captionText.textContent = text;
    captions.hidden = !(active && captionsOn && text);
  }
  function toggleCaptions() {
    captionsOn = !captionsOn;
    cc.setAttribute('aria-pressed', String(captionsOn));
    drawCaptions();
  }
  if (track) {
    track.mode = 'hidden';
    video.textTracks.addEventListener('change', () => {
      if (track.mode === 'showing') track.mode = 'hidden';
    });
    track.addEventListener('cuechange', drawCaptions);
    cc.setAttribute('aria-pressed', String(captionsOn));
    cc.addEventListener('click', toggleCaptions);
  } else cc.remove();

  // ---- quality: the version that fits the screen and the connection (Auto), or the one the viewer picks. Nothing is
  // stored: a new visit starts on Auto again.
  const versions = readVersions([...video.querySelectorAll('source')].map((s) => ({ src: s.getAttribute('src'), height: s.dataset.height, mbps: s.dataset.mbps })));
  const quality = $('.player-quality');
  const qualityButton = $('.player-quality-button');
  const qualityLabel = $('.player-quality-label');
  const menu = $('.player-menu');
  const clock = () => view.performance.now();
  let choice = 'auto'; // or the height the viewer chose
  let current = null;
  // Phones and tablets stop at 1080p on Auto: more costs data and does not show on a small screen (the menu still offers
  // it). Lowered further when playback keeps waiting, so Auto does not climb back into the stalls.
  const deviceCeiling = view.matchMedia('(pointer: coarse)').matches ? 1080 : Infinity;
  let ceiling = deviceCeiling;
  let started = false;
  let stalls = [];
  let stallTimer = 0;
  let switchedAt = -Infinity;
  function autoVersion() {
    const box = fullscreenElement() === root ? { width: view.screen.width, height: view.screen.height } : root.getBoundingClientRect();
    const net = view.navigator.connection ?? {};
    const allowed = versions.filter((v) => v.height <= ceiling);
    return pickVersion(allowed.length ? allowed : versions.slice(-1), {
      rows: rowsNeeded(box.width, box.height, view.devicePixelRatio),
      saveData: Boolean(net.saveData),
      downlink: net.downlink,
      effectiveType: net.effectiveType,
    });
  }
  // Plays another version from the same moment, playing or paused as before.
  function use(version) {
    if (!version || version === current) return;
    const t = video.currentTime;
    const playing = !video.paused && !video.ended;
    const resume = current !== null && t > 0;
    current = version;
    stalls = [];
    view.clearTimeout(stallTimer);
    switchedAt = clock();
    if (resume && !playing) video.preload = 'metadata';
    video.src = version.src;
    if (resume) {
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = t;
          if (playing) video.play().catch(() => {});
        },
        { once: true },
      );
    }
    if (playing) video.play().catch(() => {});
    syncQuality();
  }
  function syncQuality() {
    if (!current) return;
    qualityLabel.textContent = `${current.height}p`;
    qualityButton.setAttribute('aria-label', `Quality: ${choice === 'auto' ? 'Auto, ' : ''}${current.height}p`);
    for (const item of menu.children) {
      const auto = item.dataset.value === 'auto';
      item.setAttribute('aria-checked', String(auto ? choice === 'auto' : choice === Number(item.dataset.value)));
      if (!auto) continue;
      item.querySelector('.player-menu-note').textContent = choice === 'auto' ? `${current.height}p` : '';
      item.setAttribute('aria-label', choice === 'auto' ? `Auto, now ${current.height}p` : 'Auto');
    }
  }
  const items = () => [...menu.children];
  function openMenu() {
    menuOpen = true;
    menu.hidden = false;
    qualityButton.setAttribute('aria-expanded', 'true');
    (items().find((i) => i.getAttribute('aria-checked') === 'true') ?? items()[0]).focus();
    wake();
  }
  function closeMenu(refocus = false) {
    if (!menuOpen) return;
    menuOpen = false;
    menu.hidden = true;
    qualityButton.setAttribute('aria-expanded', 'false');
    if (refocus) qualityButton.focus();
    wake();
  }
  // One long wait, or a second within half a minute, moves Auto one version down for the rest of the visit.
  function checkStalls() {
    if (choice !== 'auto' || !current || !tooManyStalls(stalls, clock())) return;
    const lower = versions.find((v) => v.height < current.height);
    if (!lower) return;
    ceiling = lower.height;
    use(lower);
  }
  if (versions.length > 1) {
    quality.hidden = false;
    menu.innerHTML = [['auto', 'Auto'], ...versions.map((v) => [String(v.height), `${v.height}p`])]
      .map(([value, label]) => `<button class="player-menu-item" type="button" role="menuitemradio" aria-checked="false" tabindex="-1" data-value="${value}">${label}${value === 'auto' ? '<span class="player-menu-note"></span>' : ''}</button>`)
      .join('');
    qualityButton.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.player-menu-item');
      if (!item) return;
      choice = item.dataset.value === 'auto' ? 'auto' : Number(item.dataset.value);
      if (choice === 'auto') ceiling = deviceCeiling;
      use(choice === 'auto' ? autoVersion() : versions.find((v) => v.height === choice));
      syncQuality();
      closeMenu(true);
    });
    menu.addEventListener('keydown', (e) => {
      const list = items();
      const i = list.indexOf(doc.activeElement);
      const moves = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 };
      if (e.key === 'Tab') return closeMenu();
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return closeMenu(true);
      }
      if (!(e.key in moves)) return undefined; // Enter and Space press the item, as on any button
      e.preventDefault();
      e.stopPropagation();
      return list[(moves[e.key] + list.length) % list.length].focus();
    });
    doc.addEventListener('pointerdown', (e) => {
      if (menuOpen && !quality.contains(e.target)) closeMenu();
    });
    video.addEventListener('playing', () => {
      started = true;
      const open = stalls.at(-1);
      if (open && open.ms === null) open.ms = clock() - open.at;
      view.clearTimeout(stallTimer);
    });
    video.addEventListener('waiting', () => {
      if (!started || video.seeking || choice !== 'auto' || clock() - switchedAt < 2000) return;
      stalls = [...stalls.slice(-4), { at: clock(), ms: null }];
      checkStalls();
      view.clearTimeout(stallTimer);
      stallTimer = view.setTimeout(checkStalls, 3100);
    });
    // Until the video starts, Auto follows the window (nothing loads before Play: preload is none).
    view.addEventListener('resize', () => {
      if (!started && choice === 'auto') use(autoVersion());
    });
  }

  // ---- full screen: the whole root, so the controls and captions come along (iPhone falls back to its own player)
  const fullscreenElement = () => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  const canFull = Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled || video.webkitEnterFullscreen);
  function leaveFull() {
    if (!fullscreenElement()) return;
    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
  }
  function toggleFull() {
    if (fullscreenElement()) return leaveFull();
    if (root.requestFullscreen) {
      root
        .requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          if (view.matchMedia('(pointer: coarse)').matches) view.screen.orientation?.lock?.('landscape')?.catch?.(() => {});
        })
        .catch(() => {});
    } else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    else video.webkitEnterFullscreen?.();
  }
  function syncFull() {
    const on = fullscreenElement() === root;
    root.classList.toggle('is-fullscreen', on);
    full.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    // A bigger picture may need a taller version; a smaller one keeps what is already loading.
    if (on && choice === 'auto' && current) {
      const best = autoVersion();
      if (best && best.height > current.height) use(best);
    }
  }
  if (canFull) {
    full.addEventListener('click', toggleFull);
    doc.addEventListener('fullscreenchange', syncFull);
    doc.addEventListener('webkitfullscreenchange', syncFull);
  } else full.remove();

  // ---- keyboard shortcuts while the player has focus (sliders handle their own arrows first)
  function run(command) {
    const d = duration();
    switch (command.name) {
      case 'toggle':
        return togglePlay();
      case 'seek':
        if (d) video.currentTime = clamp(video.currentTime + command.by, 0, d);
        return paint();
      case 'jump':
        if (d) video.currentTime = command.to * d;
        return paint();
      case 'volume':
        video.muted = false;
        video.volume = clamp(video.volume + command.by);
        return undefined;
      case 'mute':
        return mute.click();
      case 'fullscreen':
        return canFull ? toggleFull() : undefined;
      case 'captions':
        return track ? toggleCaptions() : undefined;
      default:
        return undefined;
    }
  }
  root.addEventListener('keydown', (e) => {
    if (!active) return;
    const command = shortcut(e);
    if (!command) return;
    // Space on a focused button presses that button, as everywhere else.
    if (command.name === 'toggle' && e.key === ' ' && e.target.closest('button')) return;
    e.preventDefault();
    run(command);
    wake();
  });

  if (versions.length > 1) use(autoVersion());
  syncPlay();
  syncVolume();
  paint();
  return {
    activate() {
      active = true;
      // The player may have been measured hidden (the video waits in the closed theatre): choose again now.
      if (versions.length > 1 && !started && choice === 'auto') use(autoVersion());
      message.hidden = true;
      root.classList.add('is-active');
      wake();
      drawCaptions();
    },
    deactivate() {
      active = false;
      view.clearTimeout(idleTimer);
      root.classList.remove('is-active', 'is-idle');
      spin(false);
      captions.hidden = true;
      leaveFull();
    },
    focus() {
      root.focus({ preventScroll: true });
    },
  };
}
