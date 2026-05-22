import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { loadPublicRuntimeSettings, type PublicRuntimeSettings } from '../../entities/app/api'
import {
  createUserAccount,
  deactivateUserAccount,
  listUserAccounts,
  reactivateUserAccount,
  updateUserAccount,
  type UserAccountRecord,
} from '../../entities/users/api'
import { appConfig } from '../../shared/config'
import { type StoredAuthSession } from '../../shared/mutation'
import type { AssistantPersona } from '../../shared/models'

type FlashMessage = {
  tone: 'success' | 'error'
  message: string
}

type UserCreateForm = {
  userId: string
  email: string
  displayName: string
  role: string
  defaultAssistantPersona: AssistantPersona | ''
  password: string
}

type UserEditForm = {
  email: string
  displayName: string
  role: string
  defaultAssistantPersona: AssistantPersona
  password: string
}

type UserStatusFilter = 'all' | 'active' | 'inactive'

type UserManagementPanelProps = {
  authSession: StoredAuthSession | null
  formatDate: (value: string | null | undefined) => string
  onOpenSettings: () => void
}

const USER_ROLE_SUGGESTIONS = ['OPS_ADMIN', 'ADMIN', 'CREDIT_APPROVER', 'TRADER', 'OPERATIONS', 'ACCOUNTING', 'VIEWER']
const USER_PERSONA_OPTIONS: { value: AssistantPersona; label: string }[] = [
  { value: 'operator', label: 'Operator' },
  { value: 'trader', label: 'Trader' },
  { value: 'risk', label: 'Risk' },
  { value: 'admin', label: 'Admin' },
  { value: 'operations', label: 'Operations' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'reference_data', label: 'Reference Data' },
]

const EMPTY_CREATE_FORM: UserCreateForm = {
  userId: '',
  email: '',
  displayName: '',
  role: 'TRADER',
  defaultAssistantPersona: '',
  password: '',
}

const EMPTY_EDIT_FORM: UserEditForm = {
  email: '',
  displayName: '',
  role: '',
  defaultAssistantPersona: 'operator',
  password: '',
}

function hasAdministrativeAccess(session: StoredAuthSession | null): boolean {
  const role = session?.user.role.trim().toUpperCase() ?? ''
  return role === 'OPS_ADMIN' || role === 'ADMIN'
}

function isAdministrativeRole(role: string): boolean {
  const normalizedRole = role.trim().toUpperCase()
  return normalizedRole === 'OPS_ADMIN' || normalizedRole === 'ADMIN'
}

function buildEditForm(user: UserAccountRecord): UserEditForm {
  return {
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    defaultAssistantPersona: user.default_assistant_persona,
    password: '',
  }
}

function formatAssistantPersona(persona: AssistantPersona | string | null | undefined): string {
  return USER_PERSONA_OPTIONS.find((option) => option.value === persona)?.label ?? 'Operator'
}

function UserMetaRow({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="settings-kv-row">
      <div>
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function UserSummaryCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <article className="admin-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

export function UserManagementPanel({
  authSession,
  formatDate,
  onOpenSettings,
}: UserManagementPanelProps) {
  const userRequestSequenceRef = useRef(0)
  const adminEnabled = hasAdministrativeAccess(authSession)

  const [serverSettings, setServerSettings] = useState<PublicRuntimeSettings | null>(null)
  const [userAccounts, setUserAccounts] = useState<UserAccountRecord[]>([])
  const [userAccountsLoading, setUserAccountsLoading] = useState(false)
  const [userAccountsError, setUserAccountsError] = useState('')
  const [userFlash, setUserFlash] = useState<FlashMessage | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<UserCreateForm>(EMPTY_CREATE_FORM)
  const [editForm, setEditForm] = useState<UserEditForm>(EMPTY_EDIT_FORM)
  const [creatingUser, setCreatingUser] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [changingUserStatus, setChangingUserStatus] = useState(false)
  const bootstrapAdminEnabled = Boolean(serverSettings?.bootstrap_admin_enabled)
  const singleUserAuthEnabled = Boolean(serverSettings?.single_user_auth_enabled)

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      try {
        const settings = await loadPublicRuntimeSettings(appConfig.apiBase)
        if (!cancelled) {
          setServerSettings(settings)
        }
      } catch {
        if (!cancelled) {
          setServerSettings(null)
        }
      }
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  const applyLoadedUsers = useCallback((nextUsers: UserAccountRecord[], preferredUserId: string | null = null) => {
    setUserAccounts(nextUsers)
    setSelectedUserId((current) => {
      if (preferredUserId && nextUsers.some((user) => user.user_id === preferredUserId)) {
        return preferredUserId
      }
      if (current && nextUsers.some((user) => user.user_id === current)) {
        return current
      }
      return nextUsers[0]?.user_id ?? null
    })
  }, [])

  const refreshUserAccounts = useCallback(
    async (preferredUserId: string | null = null) => {
      if (!adminEnabled) {
        return
      }

      const requestId = userRequestSequenceRef.current + 1
      userRequestSequenceRef.current = requestId

      setUserAccountsLoading(true)
      setUserAccountsError('')

      try {
        const nextUsers = await listUserAccounts(appConfig.apiBase)
        if (userRequestSequenceRef.current !== requestId) {
          return
        }
        applyLoadedUsers(nextUsers, preferredUserId)
      } catch (error) {
        if (userRequestSequenceRef.current !== requestId) {
          return
        }
        setUserAccounts([])
        setSelectedUserId(null)
        setUserAccountsError(error instanceof Error ? error.message : 'Could not load user accounts.')
      } finally {
        if (userRequestSequenceRef.current === requestId) {
          setUserAccountsLoading(false)
        }
      }
    },
    [adminEnabled, applyLoadedUsers],
  )

  useEffect(() => {
    userRequestSequenceRef.current += 1
    setUserFlash(null)

    if (!adminEnabled) {
      setUserAccounts([])
      setUserAccountsError('')
      setUserAccountsLoading(false)
      setSelectedUserId(null)
      setCreateForm(EMPTY_CREATE_FORM)
      setEditForm(EMPTY_EDIT_FORM)
      return
    }

    void refreshUserAccounts()
  }, [adminEnabled, refreshUserAccounts])

  const filteredUserAccounts = useMemo(() => {
    const search = userSearch.trim().toLowerCase()

    return userAccounts.filter((user) => {
      if (userStatusFilter === 'active' && !user.is_active) {
        return false
      }
      if (userStatusFilter === 'inactive' && user.is_active) {
        return false
      }
      if (!search) {
        return true
      }

      return [user.user_id, user.display_name, user.email, user.role].some((value) =>
        value.toLowerCase().includes(search),
      )
    })
  }, [userAccounts, userSearch, userStatusFilter])

  useEffect(() => {
    if (filteredUserAccounts.length === 0) {
      setSelectedUserId(null)
      return
    }

    setSelectedUserId((current) =>
      filteredUserAccounts.some((user) => user.user_id === current) ? current : filteredUserAccounts[0].user_id,
    )
  }, [filteredUserAccounts])

  const selectedUser = useMemo(
    () => userAccounts.find((user) => user.user_id === selectedUserId) ?? null,
    [selectedUserId, userAccounts],
  )

  useEffect(() => {
    if (!selectedUser) {
      setEditForm(EMPTY_EDIT_FORM)
      return
    }

    setEditForm(buildEditForm(selectedUser))
  }, [selectedUser])

  const activeUserCount = useMemo(() => userAccounts.filter((user) => user.is_active).length, [userAccounts])
  const adminUserCount = useMemo(
    () => userAccounts.filter((user) => isAdministrativeRole(user.role)).length,
    [userAccounts],
  )
  const inactiveUserCount = userAccounts.length - activeUserCount
  const currentUserIsSelected = selectedUser?.user_id === authSession?.user.user_id

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUserFlash(null)

    const userId = createForm.userId.trim()
    const email = createForm.email.trim().toLowerCase()
    const displayName = createForm.displayName.trim()
    const role = createForm.role.trim().toUpperCase()
    const password = createForm.password.trim()

    if (!userId || !email || !displayName || !role || !password) {
      setUserFlash({
        tone: 'error',
        message: 'User ID, email, display name, role, and password are required to create an account.',
      })
      return
    }

    setCreatingUser(true)

    try {
      const createdUser = await createUserAccount(appConfig.apiBase, {
        user_id: userId,
        email,
        display_name: displayName,
        role,
        ...(createForm.defaultAssistantPersona
          ? { default_assistant_persona: createForm.defaultAssistantPersona }
          : {}),
        password,
      })

      setCreateForm(EMPTY_CREATE_FORM)
      setUserFlash({
        tone: 'success',
        message: `Created ${createdUser.display_name} and added the account to the active directory.`,
      })
      await refreshUserAccounts(createdUser.user_id)
    } catch (error) {
      setUserFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not create the user account.',
      })
    } finally {
      setCreatingUser(false)
    }
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedUser) {
      setUserFlash({
        tone: 'error',
        message: 'Select an account before saving changes.',
      })
      return
    }

    setUserFlash(null)

    const email = editForm.email.trim().toLowerCase()
    const displayName = editForm.displayName.trim()
    const role = editForm.role.trim().toUpperCase()
    const password = editForm.password.trim()

    if (!email || !displayName || !role) {
      setUserFlash({
        tone: 'error',
        message: 'Email, display name, and role are required to update an account.',
      })
      return
    }

    setSavingUser(true)

    try {
      await updateUserAccount(appConfig.apiBase, selectedUser.user_id, {
        email,
        display_name: displayName,
        role,
        default_assistant_persona: editForm.defaultAssistantPersona,
        ...(password ? { password } : {}),
      })

      setUserFlash({
        tone: 'success',
        message: `Saved updates for ${selectedUser.display_name}.`,
      })
      await refreshUserAccounts(selectedUser.user_id)
    } catch (error) {
      setUserFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not update the user account.',
      })
    } finally {
      setSavingUser(false)
    }
  }

  async function handleToggleUserStatus() {
    if (!selectedUser) {
      setUserFlash({
        tone: 'error',
        message: 'Select an account before changing its status.',
      })
      return
    }

    if (selectedUser.is_active && currentUserIsSelected) {
      setUserFlash({
        tone: 'error',
        message: 'The current signed-in account cannot be deactivated from this screen.',
      })
      return
    }

    setUserFlash(null)
    setChangingUserStatus(true)

    try {
      if (selectedUser.is_active) {
        await deactivateUserAccount(appConfig.apiBase, selectedUser.user_id)
      } else {
        await reactivateUserAccount(appConfig.apiBase, selectedUser.user_id)
      }

      setUserFlash({
        tone: 'success',
        message: `${selectedUser.display_name} is now ${selectedUser.is_active ? 'inactive' : 'active'}.`,
      })
      await refreshUserAccounts(selectedUser.user_id)
    } catch (error) {
      setUserFlash({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not update the user status.',
      })
    } finally {
      setChangingUserStatus(false)
    }
  }

  if (!adminEnabled) {
    return (
      <section className="surface feature-panel">
        <div className="section-head">
          <div>
            <span className="eyebrow">Access</span>
            <h3>User Management</h3>
          </div>
          <p>Create accounts, assign roles, rotate passwords, and deactivate access from the same admin workspace.</p>
        </div>

        <div className="empty-state empty-state-tall">
          <strong>Administrative session required</strong>
          <p>
            {authSession
              ? `Signed in as ${authSession.user.display_name} with role ${authSession.user.role}. Use Sign Out, then sign back in with an OPS_ADMIN or ADMIN account to manage users.`
              : 'Sign in with an OPS_ADMIN or ADMIN account to load the user directory and unlock account changes.'}
          </p>
        </div>

        <div className="user-management-lock-grid">
          <article className="admin-card user-editor-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">Access</span>
                <h3>Unlock User Management</h3>
              </div>
              <p>
                Admin authentication now lives on the locked sign-in screen shown before the workspace opens.
                If you need to switch accounts, sign out first, then authenticate with an administrative role.
              </p>
            </div>

            <div className="toolbar user-management-empty-actions">
              <button type="button" className="button button-ghost" onClick={onOpenSettings}>
                Open Settings
              </button>
            </div>

            <p className="form-note">
              {singleUserAuthEnabled
                ? 'Single-user OPS_ADMIN sign-in is available on the locked sign-in screen after you sign out.'
                : bootstrapAdminEnabled
                  ? 'Bootstrap Admin is available on the locked sign-in screen until the first administrative account exists.'
                  : 'Use the locked sign-in screen after signing out to switch into an OPS_ADMIN or ADMIN session.'}
            </p>
          </article>
        </div>
      </section>
    )
  }

  return (
    <section className="surface feature-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">Access</span>
          <h3>User Management</h3>
        </div>
        <p>Create accounts, assign roles, rotate passwords, and deactivate access from the same admin workspace.</p>
      </div>

      <div className="user-management-summary-grid">
        <UserSummaryCard
          label="Directory"
          value={String(userAccounts.length)}
          note={userAccountsLoading ? 'Refreshing user directory now.' : `${filteredUserAccounts.length} accounts match the current view.`}
        />
        <UserSummaryCard
          label="Active Accounts"
          value={String(activeUserCount)}
          note={inactiveUserCount === 0 ? 'No inactive accounts are currently held.' : `${inactiveUserCount} inactive accounts remain available for reactivation.`}
        />
        <UserSummaryCard
          label="Admin Accounts"
          value={String(adminUserCount)}
          note={adminUserCount === 0 ? 'No admin-capable accounts are currently configured.' : 'Accounts with ADMIN or OPS_ADMIN roles can access protected admin surfaces.'}
        />
      </div>

      <div className="user-management-grid">
        <article className="admin-card user-directory-card">
          <div className="user-management-toolbar">
            <label className="field user-management-search">
              <span>Search Accounts</span>
              <input
                className="control"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Filter by name, email, user ID, or role"
              />
            </label>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void refreshUserAccounts(selectedUserId)}
              disabled={userAccountsLoading}
            >
              {userAccountsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="tab-row user-status-filter-row">
            {(['all', 'active', 'inactive'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={`tab-pill ${userStatusFilter === filter ? 'is-active' : ''}`}
                onClick={() => setUserStatusFilter(filter)}
              >
                {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>

          {userAccountsError ? <div className="feedback-banner feedback-banner-error">{userAccountsError}</div> : null}

          <div className="user-directory-list">
            {userAccountsLoading && userAccounts.length === 0 ? (
              <>
                <div className="skeleton-block" />
                <div className="skeleton-block" />
                <div className="skeleton-block" />
              </>
            ) : filteredUserAccounts.length === 0 ? (
              <div className="empty-state">
                <strong>No accounts match this view</strong>
                <p>Adjust the search or status filter to inspect existing users, or create a new account from the editor column.</p>
              </div>
            ) : (
              filteredUserAccounts.map((user) => (
                <button
                  key={user.user_id}
                  type="button"
                  className={`user-account-row ${selectedUserId === user.user_id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedUserId(user.user_id)}
                >
                  <div className="user-account-row-head">
                    <div>
                      <strong>{user.display_name}</strong>
                      <p>{user.user_id}</p>
                    </div>
                    <span className={`status-pill status-pill-${user.is_active ? 'active' : 'cancelled'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p>{user.email}</p>
                  <div className="user-account-meta">
                    <span>{user.role}</span>
                    <span>{formatAssistantPersona(user.default_assistant_persona)} persona</span>
                    <span>{user.password_set ? 'Password set' : 'No password'}</span>
                    <span>Updated {formatDate(user.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </article>

        <div className="stack">
          <article className="admin-card user-editor-card">
            <div className="section-head section-head-control">
              <div>
                <span className="eyebrow">Selected Account</span>
                <h3>{selectedUser ? selectedUser.display_name : 'Account Editor'}</h3>
              </div>
              {selectedUser ? (
                <span className={`status-pill status-pill-${selectedUser.is_active ? 'active' : 'cancelled'}`}>
                  {selectedUser.is_active ? 'Active' : 'Inactive'}
                </span>
              ) : null}
            </div>

            {selectedUser ? (
              <>
                <div className="settings-kv">
                  <UserMetaRow label="User ID" value={selectedUser.user_id} />
                  <UserMetaRow label="Default persona" value={formatAssistantPersona(selectedUser.default_assistant_persona)} />
                  <UserMetaRow label="Created" value={formatDate(selectedUser.created_at)} detail={`By ${selectedUser.created_by}`} />
                  <UserMetaRow label="Last login" value={selectedUser.last_login_at ? formatDate(selectedUser.last_login_at) : 'Never'} />
                  <UserMetaRow label="Version" value={String(selectedUser.version)} detail={`Updated ${formatDate(selectedUser.updated_at)} by ${selectedUser.updated_by}`} />
                </div>

                <form className="stack-form user-account-form" onSubmit={handleSaveUser}>
                  <div className="mini-grid">
                    <label className="field">
                      <span>Display Name</span>
                      <input
                        className="control"
                        value={editForm.displayName}
                        onChange={(event) => {
                          setUserFlash(null)
                          setEditForm((current) => ({ ...current, displayName: event.target.value }))
                        }}
                        placeholder="Operations Lead"
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        className="control"
                        type="email"
                        value={editForm.email}
                        onChange={(event) => {
                          setUserFlash(null)
                          setEditForm((current) => ({ ...current, email: event.target.value }))
                        }}
                        placeholder="ops@example.com"
                      />
                    </label>
                    <label className="field">
                      <span>Role</span>
                      <input
                        className="control"
                        list="user-role-suggestions"
                        value={editForm.role}
                        onChange={(event) => {
                          setUserFlash(null)
                          setEditForm((current) => ({ ...current, role: event.target.value }))
                        }}
                        placeholder="TRADER"
                      />
                    </label>
                    <label className="field">
                      <span>Default Persona</span>
                      <select
                        className="control"
                        value={editForm.defaultAssistantPersona}
                        onChange={(event) => {
                          setUserFlash(null)
                          setEditForm((current) => ({
                            ...current,
                            defaultAssistantPersona: event.target.value as AssistantPersona,
                          }))
                        }}
                      >
                        {USER_PERSONA_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Reset Password</span>
                      <input
                        className="control"
                        type="password"
                        value={editForm.password}
                        onChange={(event) => {
                          setUserFlash(null)
                          setEditForm((current) => ({ ...current, password: event.target.value }))
                        }}
                        placeholder="Leave blank to keep current password"
                      />
                    </label>
                  </div>

                  <div className="toolbar user-account-actions">
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={savingUser || changingUserStatus}
                    >
                      {savingUser ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      className={`button ${selectedUser.is_active ? 'button-danger' : 'button-secondary'}`}
                      onClick={() => void handleToggleUserStatus()}
                      disabled={savingUser || changingUserStatus || (selectedUser.is_active && currentUserIsSelected)}
                    >
                      {changingUserStatus
                        ? 'Updating Status...'
                        : selectedUser.is_active
                          ? 'Deactivate Account'
                          : 'Reactivate Account'}
                    </button>
                  </div>
                </form>

                {currentUserIsSelected ? (
                  <p className="form-note">The current signed-in account is editable here, but self-deactivation is blocked to avoid invalidating the active session mid-task.</p>
                ) : null}
              </>
            ) : (
              <div className="empty-state">
                <strong>Select an account to edit</strong>
                <p>Choose a user from the directory to update profile fields, rotate a password, or change the active status.</p>
              </div>
            )}

            {userFlash ? (
              <div className={`feedback-banner ${userFlash.tone === 'error' ? 'feedback-banner-error' : 'feedback-banner-success'}`}>
                {userFlash.message}
              </div>
            ) : null}
          </article>

          <article className="admin-card user-editor-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">Provisioning</span>
                <h3>Create User</h3>
              </div>
              <p>New accounts land active immediately and can be assigned admin access only when you choose an admin-capable role.</p>
            </div>

            <form className="stack-form user-account-form" onSubmit={handleCreateUser}>
              <div className="mini-grid">
                <label className="field">
                  <span>User ID</span>
                  <input
                    className="control"
                    value={createForm.userId}
                    onChange={(event) => {
                      setUserFlash(null)
                      setCreateForm((current) => ({ ...current, userId: event.target.value }))
                    }}
                    placeholder="ops_lead"
                  />
                </label>
                <label className="field">
                  <span>Display Name</span>
                  <input
                    className="control"
                    value={createForm.displayName}
                    onChange={(event) => {
                      setUserFlash(null)
                      setCreateForm((current) => ({ ...current, displayName: event.target.value }))
                    }}
                    placeholder="Operations Lead"
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    className="control"
                    type="email"
                    value={createForm.email}
                    onChange={(event) => {
                      setUserFlash(null)
                      setCreateForm((current) => ({ ...current, email: event.target.value }))
                    }}
                    placeholder="ops@example.com"
                  />
                </label>
                <label className="field">
                  <span>Role</span>
                  <input
                    className="control"
                    list="user-role-suggestions"
                    value={createForm.role}
                    onChange={(event) => {
                      setUserFlash(null)
                      setCreateForm((current) => ({ ...current, role: event.target.value }))
                    }}
                    placeholder="TRADER"
                  />
                </label>
                <label className="field">
                  <span>Default Persona</span>
                  <select
                    className="control"
                    value={createForm.defaultAssistantPersona}
                    onChange={(event) => {
                      setUserFlash(null)
                      setCreateForm((current) => ({
                        ...current,
                        defaultAssistantPersona: event.target.value as AssistantPersona | '',
                      }))
                    }}
                  >
                    <option value="">Role default</option>
                    {USER_PERSONA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field field-wide">
                  <span>Initial Password</span>
                  <input
                    className="control"
                    type="password"
                    value={createForm.password}
                    onChange={(event) => {
                      setUserFlash(null)
                      setCreateForm((current) => ({ ...current, password: event.target.value }))
                    }}
                    placeholder="Minimum 8 characters"
                  />
                </label>
              </div>

              <div className="toolbar user-account-actions">
                <button type="submit" className="button button-primary" disabled={creatingUser}>
                  {creatingUser ? 'Creating User...' : 'Create User'}
                </button>
              </div>
            </form>
          </article>
        </div>
      </div>

      <datalist id="user-role-suggestions">
        {USER_ROLE_SUGGESTIONS.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
    </section>
  )
}
