import { useEffect, useSyncExternalStore } from 'react';

// One popup at a time. Each popup says whether it would like to show; it shows only when no popup earlier in
// ORDER also wants to (the rest wait their turn instead of opening on top of each other).

const ORDER = ['profile-copy', 'update', 'tour', 'calendar'] as const;
export type PopupId = (typeof ORDER)[number];

const wants = new Set<PopupId>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const hasTurn = (id: PopupId, wanting: ReadonlySet<PopupId> = wants) =>
  wanting.has(id) && !ORDER.slice(0, ORDER.indexOf(id)).some(other => wanting.has(other));

// true when this popup may show now
export const usePopupTurn = (id: PopupId, want: boolean) => {
  useEffect(() => {
    if (want) wants.add(id); else wants.delete(id);
    emit();
    return () => {
      wants.delete(id);
      emit();
    };
  }, [id, want]);
  const turn = useSyncExternalStore(subscribe, () => hasTurn(id));
  return want && turn;
};
