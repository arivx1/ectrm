import type { StoredAuthUser } from '../../shared/mutation'

const PROFILE_AVATAR_STORAGE_KEY_PREFIX = 'ectrm.profile-avatar.'

export function profileAvatarStorageKey(userId: string): string {
  return `${PROFILE_AVATAR_STORAGE_KEY_PREFIX}${userId}`
}

export function userInitials(user: StoredAuthUser): string {
  const nameParts = [
    user.first_name,
    user.last_name,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  const fallbackParts = nameParts.length > 0 ? nameParts : user.display_name.trim().split(/\s+/)
  const initials = fallbackParts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return initials || user.email[0]?.toUpperCase() || 'U'
}

export function readStoredProfileAvatar(userId: string): string {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.localStorage.getItem(profileAvatarStorageKey(userId)) ?? ''
}
