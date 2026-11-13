// What the production log's pages do when a reader acts. Every page works without this file too: all entries and
// pictures are then simply shown, and a picture's link opens the picture itself.
//   1. "Show only": the entries (front page) or pictures (pictures page) of the kind the reader picks. A link to
//      index.html?tag=<tag>#log opens the log with that tag picked.
//   2. An old link to an entry on the single page this log once was (index.html#<entry>) goes to the entry's page.
//   3. A picture opened large: click or Enter, arrows step through the page's pictures, Escape, the Close button or
//      a click beside the picture closes it, and the focus goes back to where it was.
// Nothing is loaded from anywhere and nothing is stored.
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  // ---- 2. old links to an entry on the front page
  const asked = decodeURIComponent(location.hash.slice(1));
  if (asked && /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+$/.test(asked) && $(`[data-entry-page="${CSS.escape(asked)}"]`)) {
    location.replace(`${asked}.html`);
    return;
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
