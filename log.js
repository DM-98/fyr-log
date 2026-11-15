// What the production log's pages do when a reader acts. Every page works without this file too: all entries and
// pictures are then simply shown, and a picture's link opens the picture itself.
//   1. "Show only": the entries (front page) or pictures (pictures page) of the kind the reader picks. A link to
//      index.html?tag=<tag>#log opens the log with that tag picked.
//   2. An old link to an entry on the single page this log once was (index.html#<entry>) goes to the entry's page.
//   3. A picture opened large: click or Enter, arrows step through the page's pictures, Escape, the Close button or
//      a click beside the picture closes it, and the focus goes back to where it was.
//   4. The gameplay video in the theatre (front page): a click, Enter or Space on the picture's play button dims the
//      room, scales the frame in and plays the video with the log's own player (player.js and player.css, loaded on
//      the first sign of interest); its light spills into the dark room. Escape, Close or a click in the dark around
//      the video: the picture goes first, then the room's light comes back slowly, and the focus returns to the play
//      button. The page does not scroll behind it, and Tab stays inside it. Without this file the play button is a
//      link to the video file itself.
// Nothing is loaded from anywhere but the log itself, and nothing is stored. The pages move whatever the system's
// animation setting says (the developer's rule for all his sites).
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  // ---- 2. old links to an entry on the front page
  const asked = decodeURIComponent(location.hash.slice(1));
  if (asked && /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+$/.test(asked) && !document.getElementById(asked)) {
    location.replace(`${asked}.html`);
    return;
  }
  // ---- 2b. old links to a section of the front page, now a page of its own
  if ($('main.front')) {
    const moved = { making: 'making.html', log: 'log.html', failures: 'failures.html', pictures: 'gallery.html' };
    const tag = new URLSearchParams(location.search).get('tag');
    if (asked === 'log' && tag) { location.replace(`log.html?tag=${encodeURIComponent(tag)}`); return; }
    if (moved[asked] && !document.getElementById(asked)) { location.replace(moved[asked]); return; }
    if (/^day-/.test(asked) && !document.getElementById(asked)) { location.replace(`log.html#${asked}`); return; }
  }

  // ---- times: written in Danish time (CET, UTC+1 in November); each one shows the reader's own time when pointed at
  // (the developer, 15 November: the judges may read it in America). The text keeps the Danish times: they are also
  // written in its sentences and the days are Danish days.
  {
    let mine = null;
    try { mine = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); } catch {}
    for (const time of $$('time[datetime]')) {
      const at = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(time.getAttribute('datetime') ?? '');
      if (!at || !mine) continue;
      const when = new Date(`${at[1]}T${at[2]}:00+01:00`);
      if (Number.isNaN(when.getTime())) continue;
      time.title = `Danish time (CET). Your time: ${mine.format(when)}`;
      time.classList.add('has-zone');
    }
  }

  // ---- 0. the torch on the name: a circle of light under the pointer shows the line above the title
  const lit = $('.hero-name.has-reveal');
  if (lit) {
    lit.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const box = lit.getBoundingClientRect();
      lit.style.setProperty('--mx', `${event.clientX - box.left}px`);
      lit.style.setProperty('--my', `${event.clientY - box.top}px`);
      lit.style.setProperty('--r', '6.5rem');
    });
    // (a finger leaves after every tap: that must not put out the light the tap below turns on)
    lit.addEventListener('pointerleave', (event) => { if (event.pointerType !== 'touch') lit.style.setProperty('--r', '0px'); });
    // no pointer to shine with: a tap on the name shows the line
    lit.addEventListener('click', (event) => { if (!event.target.closest('a')) lit.classList.toggle('lit'); });
  }

  // ---- 1. show only one kind
  const filters = $('.filters');
  if (filters) {
    const buttons = $$('button', filters);
    const items = $$('[data-kinds], .tile[data-kind]', $('main'));
    const empty = $('.empty');
    const kindsOf = (item) => (item.dataset.kinds ?? item.dataset.kind ?? '').split(' ').filter(Boolean);
    const pick = (kind) => {
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.kind === kind));
      for (const item of items) item.hidden = Boolean(kind) && !kindsOf(item).includes(kind);
      // a day, an entry's group of pictures or a day of pictures with nothing left to show is hidden too
      for (const group of $$('.day, .pentry, .pday')) group.hidden = !$$('[data-kinds], .tile[data-kind]', group).some((item) => !item.hidden);
      if (empty) empty.hidden = items.some((item) => !item.hidden);
    };
    for (const button of buttons) button.addEventListener('click', () => pick(button.getAttribute('aria-pressed') === 'true' ? '' : button.dataset.kind));
    const wanted = new URLSearchParams(location.search).get('tag');
    if (wanted && buttons.some((button) => button.dataset.kind === wanted)) pick(wanted);
  }

  // ---- 4. the gameplay video in the theatre
  const theatre = $('#theatre');
  const playButton = $('[data-video]');
  if (theatre && playButton && typeof HTMLDialogElement === 'function') setUpTheatre(theatre, playButton);

  function setUpTheatre(theatre, playButton) {
    const root = document.documentElement;
    const themeMeta = $('meta[name="theme-color"]');
    const PAGE_THEME = themeMeta?.content ?? '';
    const THEATRE_THEME = '#040507';
    const EASE_OPEN = 'cubic-bezier(0.22, 0.8, 0.2, 1)';
    const SETTLE_MS = 350; // after a close the page takes no click for this long
    const frame = $('.tframe', theatre);
    const dim = $('.tdim', theatre);
    const stage = $('.stage', theatre);
    const video = $('video', stage);
    const start = $('.tstart', theatre);
    const end = $('.tend', theatre);
    const spill = $('.spill', theatre);
    let player = null; // { activate, deactivate, focus } once player.js has taken over the video
    let loading = null;
    let open = false; // open, or opening
    let closing = false;
    let opener = null; // what opened it, to give the focus back

    const setTheme = (colour) => { if (themeMeta && colour) themeMeta.content = colour; };
    const settleAnimations = () => { for (const el of [frame, dim]) for (const animation of el.getAnimations()) animation.cancel(); };

    // The player and its styles load on the first sign of interest in the video (its own stylesheet goes before the
    // page's, so the page's settings for it win).
    function loadPlayer() {
      if (!loading) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'player.css';
        const styled = new Promise((done) => { css.onload = done; css.onerror = done; });
        document.head.insertBefore(css, $('link[rel="stylesheet"]'));
        loading = Promise.all([import('./player.js'), styled]).then(([module]) => module);
        loading.catch(() => { loading = null; });
      }
      return loading;
    }
    playButton.addEventListener('pointerover', () => { loadPlayer().catch(() => {}); });
    playButton.addEventListener('focus', () => { loadPlayer().catch(() => {}); });

    async function mount() {
      if (player) return player;
      const { mountPlayer } = await loadPlayer();
      if (!player) {
        player = mountPlayer(stage, video);
        video.addEventListener('ended', () => { if (open && !closing) showEnd(); });
      }
      return player;
    }

    // The video's light in the room: a 32 x 18 picture of it, blended in four times a second (so a cut takes about a
    // second to travel and nothing can flash), shown large and soft behind the screen.
    const spillContext = spill.getContext('2d');
    let spillTimer = 0;
    function startSpill() {
      stopSpill();
      const paint = (source, alpha) => {
        try {
          spillContext.globalAlpha = alpha;
          spillContext.drawImage(source, 0, 0, spill.width, spill.height);
        } catch {
          // A frame that is not ready yet is simply skipped.
        }
      };
      if (video.poster) {
        const still = new Image();
        still.src = video.poster;
        still.decode().then(() => { if (video.paused) paint(still, 1); }, () => {});
      }
      spillTimer = setInterval(() => {
        if (!video.paused && video.readyState >= 2 && !document.hidden) paint(video, 0.25);
      }, 250);
      theatre.classList.add('lit');
    }
    function stopSpill() {
      clearInterval(spillTimer);
      theatre.classList.remove('lit');
    }

    // The page is locked under the theatre: the scrollbar's reserved space goes and the body takes its width as
    // padding, so nothing on the page moves.
    function lock() {
      if (!root.classList.contains('locked')) root.style.setProperty('--scrollbar', `${Math.max(0, innerWidth - root.clientWidth)}px`);
      root.classList.add('locked');
    }

    // After a close the page takes no click for a moment (a second click on Close must not land on the page beneath
    // it), and the play button under a resting pointer does not look pointed at until the pointer moves.
    let settleTimer = 0;
    function settle() {
      root.classList.add('settling', 'still');
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => root.classList.remove('settling'), SETTLE_MS);
      let origin = null;
      const moved = (event) => {
        if (event.pointerType === 'mouse') {
          origin ??= [event.clientX, event.clientY];
          if (Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) < 4) return;
        }
        root.classList.remove('still');
        removeEventListener('pointermove', moved);
      };
      addEventListener('pointermove', moved);
      addEventListener('keydown', () => root.classList.remove('still'), { once: true });
    }

    async function openTheatre() {
      if (open) return;
      open = true;
      closing = false;
      opener = playButton;
      settleAnimations();
      start.hidden = true;
      end.hidden = true;
      if (!video.getAttribute('poster') && video.dataset.poster) video.poster = video.dataset.poster;
      lock();
      theatre.showModal();
      $('.close', theatre).focus({ preventScroll: true });
      setTheme(THEATRE_THEME);
      dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
      frame.animate([{ opacity: 0, transform: 'scale(0.965)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE_OPEN });
      let ready = null;
      try {
        ready = await mount();
      } catch {
        // The player could not load: the browser's own controls play the video instead.
        video.controls = true;
      }
      if (!open || closing) return;
      if (video.ended) video.currentTime = 0;
      startSpill();
      // A click may start the video with sound; if the browser still says no, it waits on its poster with a big
      // button. The player's controls appear only once it plays.
      ready?.activate();
      try {
        await video.play();
        if (open && !closing) (ready ?? video).focus({ preventScroll: true });
        return;
      } catch {
        ready?.deactivate();
      }
      if (!open || closing) return;
      start.hidden = false;
      $('[data-start]', theatre).focus({ preventScroll: true });
    }

    async function closeTheatre() {
      if (!open || closing) return;
      closing = true;
      video.pause();
      player?.deactivate();
      stopSpill();
      // The picture goes first; then the room's light comes back slowly.
      await frame.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.985)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      if (open) await dim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 780, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' }).finished.catch(() => {});
      if (theatre.open) theatre.close();
      closed();
    }

    // The theatre is closed (by its own close, or by the browser itself): the page back as it was.
    function closed() {
      if (!open) return;
      open = false;
      closing = false;
      video.pause();
      player?.deactivate();
      stopSpill();
      settleAnimations();
      root.classList.remove('locked');
      setTheme(PAGE_THEME);
      settle();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    }

    function showEnd() {
      player.deactivate();
      end.hidden = false;
      $('[data-again]', theatre).focus({ preventScroll: true });
    }

    function playFromTheatre({ restart = false } = {}) {
      if (!player) return;
      start.hidden = true;
      end.hidden = true;
      if (restart) video.currentTime = 0;
      player.activate();
      video.play().catch(() => {
        player.deactivate();
        start.hidden = false;
      });
      player.focus();
    }

    // The play button: a click or Enter (a link's own click) opens the theatre; Space opens it when the key comes up,
    // so that the same key does not then press the Close button the focus has moved to. A click with a modifier
    // keeps the link's own way (the video file, in a new tab).
    playButton.setAttribute('role', 'button');
    playButton.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openTheatre();
    });
    playButton.addEventListener('keydown', (event) => { if (event.key === ' ') event.preventDefault(); });
    playButton.addEventListener('keyup', (event) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      openTheatre();
    });

    // A click in the dark around the video (not on the screen, its title row or its note) closes the theatre with
    // the same motion as Close, as the picture viewer closes on a click beside the picture. The press must begin in
    // the dark too (a drag along the timeline that ends there is not such a click), and a press that only puts away
    // an open quality menu does nothing more.
    const inTheDark = (el) => el === theatre || Boolean(el?.matches?.('.tdim, .troom, .tframe'));
    let pressedInTheDark = false;
    theatre.addEventListener('pointerdown', (event) => {
      pressedInTheDark = inTheDark(event.target) && !$('.player-menu:not([hidden])', theatre);
    }, true);

    theatre.addEventListener('click', (event) => {
      if (inTheDark(event.target)) {
        if (pressedInTheDark) closeTheatre();
        pressedInTheDark = false;
        return;
      }
      const button = event.target.closest('button');
      if (!button) return;
      if (button.matches('[data-close-theatre]')) closeTheatre();
      else if (button.matches('[data-start]')) playFromTheatre();
      else if (button.matches('[data-again]')) playFromTheatre({ restart: true });
    });
    // Escape closes it with the same motion as the Close button.
    theatre.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeTheatre();
    });
    theatre.addEventListener('close', closed);

    // Tab stays inside the theatre: past the last control it comes round to the first, and back.
    const focusables = () => $$('a[href], button:not([disabled]), summary, [tabindex="0"], input, select, textarea', theatre).filter(
      (el) => !el.closest('[hidden], [inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
    );
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || !theatre.open) return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      const active = document.activeElement;
      if (!theatre.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    });
  }

  // ---- 3. a picture opened large
  if (typeof HTMLDialogElement !== 'function') return;
  const arrow = (d) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  let dialog = null;
  let parts = null;
  let pictures = [];
  let at = 0;
  let opener = null;

  // The words that go with a picture: its caption (a figure's figcaption, or the .cap beside the link).
  const captionOf = (link) => {
    const holder = link.parentElement;
    return holder ? $(':scope > figcaption, :scope > .cap', holder) : null;
  };

  const show = (to) => {
    at = Math.max(0, Math.min(pictures.length - 1, to));
    const link = pictures[at];
    const small = $('img', link);
    const width = Number(small.getAttribute('width')) || small.naturalWidth || 0;
    const height = Number(small.getAttribute('height')) || small.naturalHeight || 0;
    // The copy already on the page is shown at once, at the large one's place and size; the large one follows.
    const picture = parts.picture.cloneNode(false);
    picture.alt = small.alt;
    picture.src = small.currentSrc || small.src;
    if (width && height) {
      parts.figure.style.setProperty('--ratio', String(width / height));
      parts.figure.style.setProperty('--natural', `${Math.max(width, 960)}px`);
    } else {
      parts.figure.style.removeProperty('--ratio');
      parts.figure.style.removeProperty('--natural');
    }
    parts.picture.replaceWith(picture);
    parts.picture = picture;
    if (link.href !== picture.src) {
      const large = new Image();
      large.src = link.href;
      large.decode().then(() => { if (parts.picture === picture) picture.src = large.src; }).catch(() => {});
    }
    const caption = captionOf(link);
    const words = document.createElement('div');
    if (caption) {
      words.append(...[...caption.childNodes].map((node) => node.cloneNode(true)));
      for (const text of $$('span[aria-hidden="true"]', words)) text.removeAttribute('aria-hidden');
    }
    parts.caption.replaceChildren(words);
    parts.caption.hidden = !caption;
    // A caption that only repeats the picture's description is not read out a second time.
    if (caption && caption.getAttribute('aria-hidden') === 'true') parts.caption.setAttribute('aria-hidden', 'true'); else parts.caption.removeAttribute('aria-hidden');
    parts.count.textContent = `Picture ${at + 1} of ${pictures.length}`;
    const entry = link.closest('.entry');
    parts.from.textContent = entry ? `${$('.slate time', entry)?.textContent ?? ''} ${$('h1', entry)?.textContent ?? ''}`.trim() : '';
    parts.back.disabled = at === 0;
    parts.on.disabled = at === pictures.length - 1;
    for (const near of [pictures[at + 1], pictures[at - 1]]) if (near) new Image().src = near.href;
  };

  const make = () => {
    dialog = document.createElement('dialog');
    dialog.className = 'viewer';
    dialog.setAttribute('aria-label', 'Picture, large');
    dialog.innerHTML = `<div class="viewer-in">
      <div class="viewer-bar">
        <button type="button" class="viewer-step" data-step="-1" aria-label="Previous picture">${arrow('M10 3L5 8l5 5')}</button>
        <p class="viewer-count" aria-live="polite"></p>
        <button type="button" class="viewer-step" data-step="1" aria-label="Next picture">${arrow('M6 3l5 5-5 5')}</button>
        <p class="viewer-from"></p>
        <button type="button" class="viewer-close" autofocus>Close ${arrow('M3.5 3.5l9 9M12.5 3.5l-9 9')}</button>
      </div>
      <div class="viewer-stage"><figure><img alt=""><figcaption></figcaption></figure></div>
    </div>`;
    document.body.append(dialog);
    parts = { figure: $('figure', dialog), picture: $('img', dialog), caption: $('figcaption', dialog), count: $('.viewer-count', dialog), from: $('.viewer-from', dialog), back: $('[data-step="-1"]', dialog), on: $('[data-step="1"]', dialog) };
    $('.viewer-close', dialog).addEventListener('click', () => dialog.close());
    parts.back.addEventListener('click', () => show(at - 1));
    parts.on.addEventListener('click', () => show(at + 1));
    // A click beside the picture closes; one on the picture, its caption or a button does not.
    dialog.addEventListener('click', (event) => { if (!event.target.closest('figure, .viewer-bar')) dialog.close(); });
    dialog.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('summary, a')) {
        if (!(event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
      }
      const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: pictures.length - 1 }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      show(to);
    });
    let from = null;
    dialog.addEventListener('touchstart', (event) => { from = event.touches.length === 1 ? event.touches[0] : null; }, { passive: true });
    dialog.addEventListener('touchend', (event) => {
      const to = event.changedTouches[0];
      if (!from || !to) return;
      const dx = to.clientX - from.clientX;
      const dy = to.clientY - from.clientY;
      from = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) show(at + (dx < 0 ? 1 : -1));
    }, { passive: true });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('viewing');
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    });
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a.zoom');
    if (!link || link.closest('dialog') || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!dialog) make();
    pictures = $$('a.zoom', $('main')).filter((one) => !one.closest('[hidden]'));
    opener = link;
    document.documentElement.classList.add('viewing');
    dialog.showModal();
    show(pictures.indexOf(link));
  });
  for (const link of $$('a.zoom')) link.setAttribute('aria-haspopup', 'dialog');
});
