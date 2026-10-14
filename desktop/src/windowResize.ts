// Resize the frameless window from any edge or corner. Transparent frameless windows can't always be resized
// by the OS (never on Windows), so these thin handles ask the main process to follow the cursor instead.

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const send = (action: 'start' | 'stop', edge?: Edge) => {
  // @ts-expect-error ipcRenderer is injected by the preload script
  window.ipcRenderer?.send('window-resize', action, edge);
};

const EDGE = 5;   // px of each edge that resizes
const CORNER = 12; // px of each corner

const HANDLES: { edge: Edge; cursor: string; style: Partial<CSSStyleDeclaration> }[] = [
  { edge: 'n', cursor: 'ns-resize', style: { top: '0', left: `${CORNER}px`, right: `${CORNER}px`, height: `${EDGE}px` } },
  { edge: 's', cursor: 'ns-resize', style: { bottom: '0', left: `${CORNER}px`, right: `${CORNER}px`, height: `${EDGE}px` } },
  { edge: 'w', cursor: 'ew-resize', style: { left: '0', top: `${CORNER}px`, bottom: `${CORNER}px`, width: `${EDGE}px` } },
  { edge: 'e', cursor: 'ew-resize', style: { right: '0', top: `${CORNER}px`, bottom: `${CORNER}px`, width: `${EDGE}px` } },
  { edge: 'nw', cursor: 'nwse-resize', style: { top: '0', left: '0', width: `${CORNER}px`, height: `${CORNER}px` } },
  { edge: 'se', cursor: 'nwse-resize', style: { bottom: '0', right: '0', width: `${CORNER}px`, height: `${CORNER}px` } },
  { edge: 'ne', cursor: 'nesw-resize', style: { top: '0', right: '0', width: `${CORNER}px`, height: `${CORNER}px` } },
  { edge: 'sw', cursor: 'nesw-resize', style: { bottom: '0', left: '0', width: `${CORNER}px`, height: `${CORNER}px` } },
];

export const installWindowResize = () => {
  // @ts-expect-error ipcRenderer is injected by the preload script
  if (!window.ipcRenderer) return; // Only in the app
  let resizing = false;

  const stop = () => {
    if (!resizing) return;
    resizing = false;
    send('stop');
  };

  for (const { edge, cursor, style } of HANDLES) {
    const handle = document.createElement('div');
    handle.dataset.interactive = '';
    Object.assign(handle.style, { position: 'fixed', zIndex: '9999', cursor, ...style });
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      resizing = true;
      handle.setPointerCapture(event.pointerId);
      send('start', edge);
    });
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);
    document.body.appendChild(handle);
  }
  window.addEventListener('blur', stop);
};
