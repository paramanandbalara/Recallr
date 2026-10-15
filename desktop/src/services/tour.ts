// The first-run tour of the main window (components/GuidedTour.tsx): its steps, whether it was seen,
// and where its card goes. The controls it points at carry data-tour="…".

const SEEN_KEY = 'secondBrain_tourSeen';
export const TOUR_EVENT = 'recallr:tour';

export interface TourStep {
  target: string; // data-tour value
  title: string;  // English; translated where shown
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  { target: 'listen', title: 'Start listening', body: 'Click Listen when the interview starts. Recallr hears each question and writes an answer while it’s still being asked.' },
  { target: 'source', title: 'Choose what it hears', body: 'Call audio hears the other people in the call. Click to switch to the call and your mic (so it knows what you said), or your mic only.' },
  { target: 'screen', title: 'Questions on your screen', body: 'A coding problem or a question in the chat? This reads it from your screen and answers it.' },
  { target: 'ask', title: 'Type a question', body: 'Type any question here and press Enter. Your prepared answers are used first.' },
  { target: 'display', title: 'Display and practice', body: 'Window styles (compact, prompter, glass), text size, theme and shortcuts, and the mock interview to practise out loud.' },
  { target: 'settings', title: 'Your profile and interviews', body: 'Add your resume and the job so answers sound like you, and your interview dates for a prep pack the day before.' },
];

export const tourSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === 'yes';
  } catch {
    return true; // Storage unavailable: don't show it on every start
  }
};

export const markTourSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, 'yes');
  } catch {
    // Shown again next time; harmless
  }
};

// Display → Replay tour
export const replayTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

// ---------- Layout (no side effects; tested) ----------

export interface Rect { x: number; y: number; w: number; h: number }
interface Size { w: number; h: number }

export const TOUR_MARGIN = 8; // Space to the window's edges
const GAP = 10;               // Between the highlight and the card

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

// The highlight around a control (padded, kept inside the window)
export const spotlightRect = (r: { left: number; top: number; right: number; bottom: number }, view: Size, pad = 5): Rect | null => {
  if (r.right - r.left <= 0 || r.bottom - r.top <= 0) return null; // Hidden in this window style
  const x = Math.max(2, r.left - pad);
  const y = Math.max(2, r.top - pad);
  return { x, y, w: Math.max(0, Math.min(view.w - 2, r.right + pad) - x), h: Math.max(0, Math.min(view.h - 2, r.bottom + pad) - y) };
};

// Where the card goes: below the highlight if it fits, else above, else on the roomier side; never off-window.
// `arrow` is the pointer's x inside the card (null with no highlight: the card is centred).
export const placeCard = (hole: Rect | null, card: Size, view: Size) => {
  if (!hole) {
    return {
      left: clamp((view.w - card.w) / 2, TOUR_MARGIN, view.w - card.w - TOUR_MARGIN),
      top: clamp((view.h - card.h) / 2, TOUR_MARGIN, view.h - card.h - TOUR_MARGIN),
      arrow: null, below: true,
    };
  }
  const below = hole.y + hole.h + GAP;
  const above = hole.y - GAP - card.h;
  const fitsBelow = below + card.h <= view.h - TOUR_MARGIN;
  const fitsAbove = above >= TOUR_MARGIN;
  const placeBelow = fitsBelow || (!fitsAbove && view.h - (hole.y + hole.h) >= hole.y);
  const top = clamp(placeBelow ? below : above, TOUR_MARGIN, view.h - card.h - TOUR_MARGIN);
  const left = clamp(hole.x + hole.w / 2 - card.w / 2, TOUR_MARGIN, view.w - card.w - TOUR_MARGIN);
  return { left, top, arrow: clamp(hole.x + hole.w / 2 - left, 16, card.w - 16), below: placeBelow };
};
