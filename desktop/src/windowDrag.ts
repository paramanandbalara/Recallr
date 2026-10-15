// Drag the frameless window by holding any `.drag-area` header (not its buttons or inputs).
// The main process moves the window with the cursor until the mouse is released.

const send = (action: 'start' | 'stop') => {
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.send('window-drag', action);
};

export const installWindowDrag = () => {
  let dragging = false;

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    send('stop');
  };

  document.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const area = target.closest<HTMLElement>('.drag-area');
    if (!area || target.closest('button, input, textarea, select, a, label')) return;

    event.preventDefault();
    dragging = true;
    area.setPointerCapture(event.pointerId);
    send('start');
  });

  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  document.addEventListener('lostpointercapture', stop, true);
  window.addEventListener('blur', stop);
};
