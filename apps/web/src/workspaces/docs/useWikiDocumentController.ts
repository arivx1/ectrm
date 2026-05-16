import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import type { WikiPageDetail, WikiPageSummary } from '../../entities/wiki/api'
import {
  createWikiPage,
  loadWikiPageDetail,
  loadWikiPageIndex,
  restoreWikiPageRevision,
  updateWikiPage,
} from '../../entities/wiki/api'
import type { StoredAuthSession } from '../../shared/mutation'
import { buildWikiDescendantIdSet, buildWikiPageTree, filterWikiPageTree } from './wikiTree'

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'The wiki request failed.'
}

function resolvePreferredPageId(
  pages: WikiPageSummary[],
  preferredPageId: string | null,
): string | null {
  if (preferredPageId && pages.some((page) => page.page_id === preferredPageId)) {
    return preferredPageId
  }
  return pages.find((page) => page.parent_page_id === null)?.page_id ?? pages[0]?.page_id ?? null
}

export function useWikiDocumentController({
  apiBase,
  authSession,
  enabled,
}: {
  apiBase: string
  authSession: StoredAuthSession | null
  enabled: boolean
}) {
  const [pages, setPages] = useState<WikiPageSummary[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState<WikiPageDetail | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [titleDraft, setTitleDraft] = useState('')
  const [parentDraft, setParentDraft] = useState('')
  const [contentDraft, setContentDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null)
  const [restoringRevisionId, setRestoringRevisionId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const tree = useMemo(() => buildWikiPageTree(pages), [pages])
  const filteredTree = useMemo(() => filterWikiPageTree(tree, deferredSearchQuery), [deferredSearchQuery, tree])
  const selectedPageDescendantIds = useMemo(
    () => (selectedPageId ? buildWikiDescendantIdSet(pages, selectedPageId) : new Set<string>()),
    [pages, selectedPageId],
  )
  const parentOptions = useMemo(
    () =>
      pages.filter(
        (page) => page.page_id !== selectedPageId && !selectedPageDescendantIds.has(page.page_id),
      ),
    [pages, selectedPageDescendantIds, selectedPageId],
  )

  const hasAuth = authSession !== null
  const accessToken = authSession?.accessToken ?? ''
  const dirty =
    selectedPage !== null &&
    (titleDraft !== selectedPage.title ||
      parentDraft !== (selectedPage.parent_page_id ?? '') ||
      contentDraft !== selectedPage.content_markdown)

  function hydrateSelectedPage(page: WikiPageDetail) {
    setSelectedPageId(page.page_id)
    setSelectedPage(page)
    setTitleDraft(page.title)
    setParentDraft(page.parent_page_id ?? '')
    setContentDraft(page.content_markdown)
  }

  async function fetchPageIndex() {
    if (!authSession) {
      return []
    }
    const payload = await loadWikiPageIndex(apiBase, authSession.accessToken)
    return payload.pages
  }

  useEffect(() => {
    if (!enabled) {
      return
    }
    if (!accessToken) {
      setPages([])
      setSelectedPageId(null)
      setSelectedPage(null)
      setTitleDraft('')
      setParentDraft('')
      setContentDraft('')
      setError('')
      setNotice('')
      return
    }

    let cancelled = false

    async function initializeWiki() {
      setLoading(true)
      setError('')

      try {
        const nextPages = (await loadWikiPageIndex(apiBase, accessToken)).pages
        if (cancelled) {
          return
        }

        setPages(nextPages)
        const nextPageId = resolvePreferredPageId(nextPages, selectedPageId)

        if (!nextPageId) {
          setSelectedPageId(null)
          setSelectedPage(null)
          setTitleDraft('')
          setParentDraft('')
          setContentDraft('')
          return
        }

        const page = await loadWikiPageDetail(apiBase, accessToken, nextPageId)
        if (cancelled) {
          return
        }

        setSelectedPageId(page.page_id)
        setSelectedPage(page)
        setTitleDraft(page.title)
        setParentDraft(page.parent_page_id ?? '')
        setContentDraft(page.content_markdown)
      } catch (nextError: unknown) {
        if (!cancelled) {
          setError(describeError(nextError))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void initializeWiki()

    return () => {
      cancelled = true
    }
  }, [accessToken, apiBase, enabled, selectedPageId])

  function confirmDiscardChanges(): boolean {
    if (!dirty || typeof window === 'undefined') {
      return true
    }
    return window.confirm('Discard unsaved wiki changes and open another page?')
  }

  async function handleSelectPage(pageId: string) {
    if (!authSession || pageId === selectedPageId) {
      return
    }
    if (!confirmDiscardChanges()) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const page = await loadWikiPageDetail(apiBase, authSession.accessToken, pageId)
      hydrateSelectedPage(page)
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreatePage(parentPageId: string | null) {
    if (!authSession) {
      return
    }
    if (!confirmDiscardChanges()) {
      return
    }

    setCreatingParentId(parentPageId ?? 'root')
    setError('')
    setNotice('')

    try {
      const createdPage = await createWikiPage(apiBase, authSession.accessToken, {
        title: 'Untitled Page',
        parent_page_id: parentPageId,
        content_markdown: '',
      })
      setNotice(parentPageId ? 'Created a child wiki page.' : 'Created a new wiki page.')
      hydrateSelectedPage(createdPage)
      setPages(await fetchPageIndex())
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setCreatingParentId(null)
    }
  }

  async function handleSavePage() {
    if (!authSession || !selectedPage || !dirty) {
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const updatedPage = await updateWikiPage(apiBase, authSession.accessToken, selectedPage.page_id, {
        title: titleDraft,
        parent_page_id: parentDraft || null,
        content_markdown: contentDraft,
      })
      hydrateSelectedPage(updatedPage)
      setPages(await fetchPageIndex())
      setNotice('Saved wiki changes.')
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setSaving(false)
    }
  }

  function handleResetDraft() {
    if (!selectedPage) {
      return
    }
    setTitleDraft(selectedPage.title)
    setParentDraft(selectedPage.parent_page_id ?? '')
    setContentDraft(selectedPage.content_markdown)
    setNotice('Reverted unsaved changes.')
  }

  async function handleRestoreRevision(revisionId: number) {
    if (!authSession || !selectedPage) {
      return
    }

    setRestoringRevisionId(revisionId)
    setError('')
    setNotice('')

    try {
      const restoredPage = await restoreWikiPageRevision(
        apiBase,
        authSession.accessToken,
        selectedPage.page_id,
        revisionId,
        authSession.user.user_id,
      )
      hydrateSelectedPage(restoredPage)
      setPages(await fetchPageIndex())
      setNotice(`Restored revision ${revisionId}.`)
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setRestoringRevisionId(null)
    }
  }

  return {
    contentDraft,
    creatingParentId,
    dirty,
    error,
    filteredTree,
    handleCreatePage,
    handleResetDraft,
    handleRestoreRevision,
    handleSavePage,
    handleSelectPage,
    hasAuth,
    loading,
    notice,
    pages,
    parentDraft,
    parentOptions,
    restoringRevisionId,
    saving,
    searchQuery,
    selectedPage,
    selectedPageId,
    setContentDraft,
    setError,
    setNotice,
    setParentDraft,
    setSearchQuery,
    setTitleDraft,
    titleDraft,
  }
}
