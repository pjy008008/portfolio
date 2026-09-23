export function initProjectShowcase() {
  const showcase = document.querySelector('.service-showcase');
  if (!showcase) return;

  const tablist = showcase.querySelector('[role="tablist"]');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const video = showcase.querySelector('video');

  function selectFeature(index) {
    tabs.forEach((tab, position) => {
      const selected = index === position;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[position].hidden = !selected;
    });
    if (video.closest('[role="tabpanel"]').hidden) video.pause();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectFeature(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectFeature(next);
      tabs[next].focus({preventScroll: true});
    });
  });
  selectFeature(0);
  tablist.hidden = false;

  // Playback is always user-initiated and stops when the demo is no longer visible.
  new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) video.pause();
  }).observe(video);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
  });

  const dialog = showcase.querySelector('.feature-dialog');
  if (typeof dialog.showModal !== 'function') return;
  const dialogImage = dialog.querySelector('img');
  const dialogTitle = dialog.querySelector('h4');
  const zoomButton = dialog.querySelector('[data-feature-zoom]');
  const imageStage = dialog.querySelector('.feature-dialog-stage');
  let opener;

  function resetZoom() {
    dialog.classList.remove('is-zoomed');
    zoomButton.setAttribute('aria-pressed', 'false');
    zoomButton.textContent = '원본 크기';
    imageStage.scrollTo(0, 0);
  }

  showcase.querySelectorAll('.feature-screen-link').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      const source = link.querySelector('img');
      dialogImage.src = source.src;
      dialogImage.alt = source.alt;
      dialogImage.width = Number(source.getAttribute('width'));
      dialogImage.height = Number(source.getAttribute('height'));
      dialogTitle.textContent = link.dataset.screenTitle;
      resetZoom();
      dialog.showModal();
      document.documentElement.classList.add('has-feature-dialog');
    });
  });
  zoomButton.addEventListener('click', () => {
    const zoomed = dialog.classList.toggle('is-zoomed');
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.textContent = zoomed ? '화면에 맞춤' : '원본 크기';
    imageStage.scrollTo(0, 0);
  });
  dialog.querySelector('[data-feature-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('has-feature-dialog');
    resetZoom();
    opener?.focus({preventScroll: true});
  });
  window.addEventListener('beforeprint', () => {
    video.pause();
    if (dialog.open) dialog.close();
  });
}
