import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import {
  MOBILE_NAV_MEDIA_QUERY,
  mobileNavigationToggleLabel,
  shouldHideMobileNavigation,
} from '../../app/navigation'
import type { InspectorTab, ViewKey } from '../../shared/models'

function detectMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_NAV_MEDIA_QUERY).matches
  }

  return window.innerWidth < 1080
}

export function useAppShellState(
  currentView: ViewKey,
  initialInspectorTab: InspectorTab | null = null,
) {
  const [roadmapRefreshVersion, setRoadmapRefreshVersion] = useState(0)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>(initialInspectorTab ?? 'overview')
  const [mobileNavState, setMobileNavState] = useState({ open: false, view: currentView })
  const [isMobileViewport, setIsMobileViewport] = useState(() => detectMobileViewport())
  const [eventFilter, setEventFilter] = useState('ALL')
  const mobileNavOpen = mobileNavState.open && mobileNavState.view === currentView && isMobileViewport

  const setMobileNavOpen: Dispatch<SetStateAction<boolean>> = (value) => {
    setMobileNavState((current) => {
      const currentOpen = current.open && current.view === currentView && isMobileViewport
      const nextOpen = typeof value === 'function' ? value(currentOpen) : value
      return nextOpen
        ? { open: true, view: currentView }
        : { open: false, view: current.view }
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (typeof window.matchMedia !== 'function') {
      function handleResize() {
        setIsMobileViewport(detectMobileViewport())
      }

      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }

    const mediaQuery = window.matchMedia(MOBILE_NAV_MEDIA_QUERY)

    function handleViewportChange(event: MediaQueryListEvent) {
      setIsMobileViewport(event.matches)
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleViewportChange)
      return () => {
        mediaQuery.removeEventListener('change', handleViewportChange)
      }
    }

    mediaQuery.addListener(handleViewportChange)

    return () => {
      mediaQuery.removeListener(handleViewportChange)
    }
  }, [])

  useEffect(() => {
    if (!isMobileViewport || !mobileNavOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMobileViewport, mobileNavOpen])

  function handleRoadmapPublished() {
    setRoadmapRefreshVersion((current) => current + 1)
  }

  return {
    eventFilter,
    handleRoadmapPublished,
    inspectorTab,
    isMobileViewport,
    mobileNavHidden: shouldHideMobileNavigation({ isMobileViewport, mobileNavOpen }),
    mobileNavOpen,
    mobileNavToggleActionLabel: mobileNavigationToggleLabel(mobileNavOpen),
    roadmapRefreshVersion,
    setEventFilter,
    setInspectorTab,
    setMobileNavOpen,
  }
}
