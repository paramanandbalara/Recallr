import { useEffect } from 'react'

/**
 * Keeps the Electron window click-through unless the cursor is over an element
 * marked with `data-interactive`. Prevents the overlay from stealing focus from
 * the browser when the user clicks empty/transparent areas.
 */
export function useClickThrough() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).api
    if (!api?.setIgnoreMouse) return

    let locked = false // true while a mouse button is held down

    const onMove = (e: MouseEvent) => {
      if (locked) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const interactive = !!(el && (el as Element).closest('[data-interactive]'))
      api.setIgnoreMouse(!interactive)
    }

    const onDown = () => { locked = true }
    const onUp = () => {
      locked = false
      api.setIgnoreMouse(true)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('mouseup', onUp, true)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mouseup', onUp, true)
    }
  }, [])
}

/**
 * Real keyboard focus for text inputs. Call inside any component that renders
 * an <input>/<textarea>, or once at the top level (see App).
 */
export function useTypingFocus() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).api
    if (!api?.setFocusable) return

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      const tag = t.tagName
      const isTextInput =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        t.isContentEditable ||
        (tag === 'INPUT' && (t as HTMLInputElement).type !== 'button')
      if (isTextInput) api.setFocusable(true)
    }
    const onFocusOut = () => api.setFocusable(false)

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])
}