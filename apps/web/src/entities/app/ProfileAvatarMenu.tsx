import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

import type { StoredAuthSession } from '../../shared/mutation'
import {
  profileAvatarStorageKey,
  readStoredProfileAvatar,
  userInitials,
} from './profileAvatarMenuSupport'

export function ProfileAvatarMenu({
  authSession,
  onOpenSettings,
  onSignOut,
  signOutPending,
}: {
  authSession: StoredAuthSession | null
  onOpenSettings: () => void
  onSignOut: () => Promise<void>
  signOutPending: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [avatarSrc, setAvatarSrc] = useState(() =>
    authSession ? readStoredProfileAvatar(authSession.user.user_id) : '',
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const user = authSession?.user ?? null
  const initials = useMemo(() => (user ? userInitials(user) : 'U'), [user])

  useEffect(() => {
    if (!menuOpen) {
      return undefined
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }
      setMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const handleAvatarFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null
      event.target.value = ''
      if (!file || !user) {
        return
      }

      if (!file.type.startsWith('image/')) {
        setAvatarError('Choose an image file.')
        return
      }

      if (file.size > 1_500_000) {
        setAvatarError('Choose an image under 1.5 MB.')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : ''
        if (!result) {
          setAvatarError('Could not read that image.')
          return
        }
        window.localStorage.setItem(profileAvatarStorageKey(user.user_id), result)
        setAvatarSrc(result)
        setAvatarError('')
      }
      reader.onerror = () => setAvatarError('Could not read that image.')
      reader.readAsDataURL(file)
    },
    [user],
  )

  if (!user) {
    return null
  }

  return (
    <div className="profile-avatar-menu" ref={menuRef}>
      <button
        type="button"
        className="profile-avatar-trigger"
        aria-label={`Open profile menu for ${user.display_name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((current) => !current)}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="profile-avatar-image" />
        ) : (
          <span className="profile-avatar-initials" aria-hidden="true">
            {initials}
          </span>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        className="profile-avatar-file-input"
        accept="image/*"
        onChange={handleAvatarFile}
        aria-label="Choose profile picture"
      />

      {menuOpen ? (
        <div className="profile-avatar-popover" role="menu" aria-label="Profile menu">
          <div className="profile-avatar-popover-head">
            <strong>{user.display_name}</strong>
            <small>{user.role}</small>
          </div>
          <button
            type="button"
            role="menuitem"
            className="profile-avatar-menu-item"
            onClick={() => fileInputRef.current?.click()}
          >
            Edit profile picture
          </button>
          <button
            type="button"
            role="menuitem"
            className="profile-avatar-menu-item"
            onClick={() => {
              setMenuOpen(false)
              onOpenSettings()
            }}
          >
            User settings
          </button>
          <button
            type="button"
            role="menuitem"
            className="profile-avatar-menu-item profile-avatar-menu-item-danger"
            onClick={() => {
              setMenuOpen(false)
              void onSignOut()
            }}
            disabled={signOutPending}
          >
            {signOutPending ? 'Signing out...' : 'Sign out'}
          </button>
          {avatarError ? <small className="profile-avatar-menu-error">{avatarError}</small> : null}
        </div>
      ) : null}
    </div>
  )
}
