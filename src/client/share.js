const dialog = document.getElementById('image-viewer');
const large = document.getElementById('large-image');
for (const image of document.querySelectorAll('.card-image img')) {
  const failed = () => {
    const label = document.createElement('span');
    label.className = 'no-image';
    label.textContent = 'Image unavailable';
    image.replaceWith(label);
  };
  image.onerror = failed;
  if (image.complete && !image.naturalWidth) failed();
}
if (dialog) {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-enlarge]');
    if (!button || !button.dataset.enlarge) return;
    large.src = button.dataset.enlarge;
    large.alt = button.dataset.title;
    large.onerror = () => {
      large.onerror = null;
      const low = button.querySelector('img')?.src;
      if (low && low !== large.src) large.src = low;
    };
    dialog.showModal();
  });
  document.getElementById('close-image').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
