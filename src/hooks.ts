// Scrolling and entrances, ported from mikael-portfolio (src/hooks.ts) so both sites move the same way.
import Lenis from 'lenis'
import { useEffect, useSyncExternalStore } from 'react'
import { anchorDuration, anchorTarget, clamp, easeOutExpo } from './scroll'

/** The running smooth-scroll instance, shared so in-page links glide on the same engine as the wheel. */
let lenis: Lenis | null = null

/**
 * Wheel and trackpad scrolling eases toward its target instead of jumping in steps. Touch keeps the
 * platform's own scrolling. Off under reduced motion.
 */
export function useSmoothScroll(reduced: boolean) {
  useEffect(() => {
    if (reduced) return
    const instance = new Lenis({ lerp: 0.09, wheelMultiplier: 1, autoRaf: true })
    lenis = instance
    return () => {
      instance.destroy()
      if (lenis === instance) lenis = null
    }
  }, [reduced])
}

const reducedQuery = '(prefers-reduced-motion: reduce)'

function subscribeReduced(callback: () => void) {
  const mq = window.matchMedia(reducedQuery)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  )
}

/**
 * Marks `[data-reveal]` elements as entered once they scroll into view, once each. Content is visible by
 * default in CSS; this only adds the entrance. Elements that enter in the same frame under the same parent are
 * staggered 70ms apart in reading order (capped at four). Under reduced motion the CSS keeps only the fade.
 * Elements added later (a song you just analysed) are picked up by a MutationObserver.
 */
export function useRevealOnScroll() {
  useEffect(() => {
    document.documentElement.classList.add('ready')
    const showAll = () =>
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => el.classList.add('is-in'))
    if (!('IntersectionObserver' in window)) {
      showAll()
      return
    }
    let io: IntersectionObserver
    let called = false
    try {
      io = new IntersectionObserver(
        (entries) => {
          called = true
          const entering = entries
            .filter((entry) => entry.isIntersecting)
            .sort(
              (a, b) =>
                a.boundingClientRect.top - b.boundingClientRect.top ||
                a.boundingClientRect.left - b.boundingClientRect.left,
            )
          const placed = new Map<Element | null, number>()
          entering.forEach((entry) => {
            const el = entry.target as HTMLElement
            const index = placed.get(el.parentElement) ?? 0
            placed.set(el.parentElement, index + 1)
            el.style.setProperty('--d', `${Math.min(index, 4) * 70}ms`)
            el.classList.add('is-in')
            io.unobserve(el)
          })
        },
        { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
      )
    } catch {
      showAll()
      return
    }
    const watch = (root: ParentNode) =>
      root.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)').forEach((el) => io.observe(el))
    watch(document)
    const mo = new MutationObserver((records) => {
      for (const record of records)
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node.matches('[data-reveal]')) io.observe(node)
          watch(node)
        })
    })
    mo.observe(document.body, { childList: true, subtree: true })

    const onFocusIn = (event: FocusEvent) => {
      const pending = (event.target as Element | null)?.closest<HTMLElement>('[data-reveal]')
      if (pending) {
        pending.style.setProperty('--d', '0ms')
        pending.classList.add('is-in')
      }
    }
    document.addEventListener('focusin', onFocusIn)
    // At the very end of the page the observer's bottom margin can hold the last lines back: show what is on screen.
    let frame = 0
    const revealAtEnd = () => {
      frame = 0
      const root = document.documentElement
      if (window.innerHeight + window.scrollY < root.scrollHeight - 2) return
      document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)').forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.bottom > 0 && rect.top < window.innerHeight) el.classList.add('is-in')
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(revealAtEnd)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    // A working observer reports straight away. If it stays silent, show the copy.
    const watchdog = window.setTimeout(() => {
      if (!called) showAll()
    }, 2000)
    return () => {
      window.clearTimeout(watchdog)
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/**
 * In-page links glide to their target with an exponential ease-out whose duration grows with the distance.
 * The hash and history entry update and focus moves to the target, as with a native jump. Wheel, touch, a
 * scrollbar drag or a scrolling key stops it where it is.
 */
export function useSmoothAnchors() {
  useEffect(() => {
    let frame = 0
    let release: (() => void) | null = null

    const cancel = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      release?.()
      release = null
    }

    const animateTo = (target: number) => {
      cancel()
      const from = window.scrollY
      const distance = Math.abs(target - from)
      if (distance < 2) return
      const duration = anchorDuration(distance)
      if (lenis) {
        lenis.scrollTo(target, { duration: duration / 1000, easing: easeOutExpo })
        return
      }
      const start = performance.now()
      let expected = from
      const interrupt = (event: Event) => {
        if (event.type === 'keydown' && !SCROLL_KEYS.has((event as KeyboardEvent).key)) return
        cancel()
      }
      const types = ['wheel', 'touchstart', 'mousedown', 'keydown'] as const
      types.forEach((type) => window.addEventListener(type, interrupt, { passive: true }))
      release = () => types.forEach((type) => window.removeEventListener(type, interrupt))
      const step = (now: number) => {
        if (Math.abs(window.scrollY - expected) > 2) {
          cancel()
          return
        }
        const t = clamp((now - start) / duration, 0, 1)
        expected = from + (target - from) * easeOutExpo(t)
        window.scrollTo({ top: expected, behavior: 'instant' })
        if (t < 1) frame = requestAnimationFrame(step)
        else cancel()
      }
      frame = requestAnimationFrame(step)
    }

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      const hash = anchor?.getAttribute('href')
      if (!anchor || !hash || hash.length < 2) return
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (!target) return
      event.preventDefault()
      const root = document.documentElement
      const offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0
      const top = target.getBoundingClientRect().top + window.scrollY
      const y = anchorTarget(top, offset, root.scrollHeight - window.innerHeight)
      try {
        if (window.location.hash !== hash) window.history.pushState(null, '', hash)
      } catch {
        // Some embedded viewers refuse history changes; the scroll still happens.
      }
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
      animateTo(y)
    }

    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
      cancel()
    }
  }, [])
}

/** Glide to an element from script (after a song is analysed, the verdict comes into view). */
export function glideTo(el: Element | null) {
  if (!el) return
  const root = document.documentElement
  const offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0
  const top = el.getBoundingClientRect().top + window.scrollY
  const y = anchorTarget(top, offset, root.scrollHeight - window.innerHeight)
  if (lenis) lenis.scrollTo(y, { duration: anchorDuration(Math.abs(y - window.scrollY)) / 1000, easing: easeOutExpo })
  else window.scrollTo({ top: y, behavior: window.matchMedia(reducedQuery).matches ? 'instant' : 'smooth' })
}
