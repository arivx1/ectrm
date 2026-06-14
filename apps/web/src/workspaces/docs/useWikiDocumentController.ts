import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import type { WikiPageDetail, WikiPageSearchResult, WikiPageSummary } from '../../entities/wiki/api'
import {
  archiveWikiPage,
  createWikiPage,
  loadWikiPageDetail,
  loadWikiPageIndex,
  restoreArchivedWikiPage,
  restoreWikiPageRevision,
  searchWikiPages,
  updateWikiPage,
} from '../../entities/wiki/api'
import type { StoredAuthSession } from '../../shared/mutation'
import { buildWikiDescendantIdSet, buildWikiPageTree, filterWikiPageTree } from './wikiTree'
import { parseWikiMarkdownLinks, rewriteWikiMarkdownLinkTarget } from './wikiMarkdown'
import {
  DEFAULT_WIKI_PAGE_TEMPLATE_KEY,
  WIKI_PAGE_TEMPLATES,
  buildWikiPageTemplateDraft,
  resolveWikiPageTemplate,
  type WikiPageTemplateKey,
} from './wikiTemplates'

export type WikiBacklink = {
  page: WikiPageSummary
  mentions: Array<{
    label: string
    target: string
    snippet: string
  }>
  labels: string[]
}

export type WikiUnresolvedLink = {
  label: string
  target: string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'The wiki request failed.'
}

function normalizeWikiLinkTarget(target: string): string {
  return target.trim().toLowerCase()
}

function unresolvedLinkKey(link: WikiUnresolvedLink): string {
  return `${normalizeWikiLinkTarget(link.target)}:${normalizeWikiLinkTarget(link.label)}`
}

function titleFromUnresolvedLink(link: WikiUnresolvedLink): string {
  return (link.label === link.target ? link.label : link.target).trim()
}

function resolvePageFromLookup(
  lookup: Map<string, WikiPageSummary>,
  target: string,
): WikiPageSummary | null {
  return lookup.get(normalizeWikiLinkTarget(target)) ?? null
}

function resolvePreferredPageId(
  pages: WikiPageSummary[],
  preferredPageId: string | null,
): string | null {
  if (preferredPageId && pages.some((page) => page.page_id === preferredPageId)) {
    return preferredPageId
  }

  const activePages = pages.filter((page) => !page.is_archived)
  const archivedPages = pages.filter((page) => page.is_archived)

  return (
    activePages.find((page) => page.parent_page_id === null)?.page_id ??
    activePages[0]?.page_id ??
    archivedPages.find((page) => page.parent_page_id === null)?.page_id ??
    archivedPages[0]?.page_id ??
    null
  )
}

async function fetchWikiPageIndex(apiBase: string, accessToken: string): Promise<WikiPageSummary[]> {
  if (!accessToken) {
    return []
  }

  const payload = await loadWikiPageIndex(apiBase, accessToken, {
    includeArchived: true,
  })
  return payload.pages
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
  const normalizedDeferredSearchQuery = deferredSearchQuery.trim()
  const hasRankedSearchQuery = normalizedDeferredSearchQuery.length >= 2
  const [searchResults, setSearchResults] = useState<WikiPageSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [parentDraft, setParentDraft] = useState('')
  const [contentDraft, setContentDraft] = useState('')
  const [newPageTemplateKey, setNewPageTemplateKey] = useState<WikiPageTemplateKey>(
    DEFAULT_WIKI_PAGE_TEMPLATE_KEY,
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null)
  const [creatingUnresolvedLinkKey, setCreatingUnresolvedLinkKey] = useState<string | null>(null)
  const [archivingPageId, setArchivingPageId] = useState<string | null>(null)
  const [restoringArchivedPageId, setRestoringArchivedPageId] = useState<string | null>(null)
  const [restoringRevisionId, setRestoringRevisionId] = useState<number | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const activePages = useMemo(
    () => pages.filter((page) => !page.is_archived),
    [pages],
  )
  const archivedPages = useMemo(
    () => pages.filter((page) => page.is_archived),
    [pages],
  )
  const activeTree = useMemo(() => buildWikiPageTree(activePages), [activePages])
  const archivedTree = useMemo(() => buildWikiPageTree(archivedPages), [archivedPages])
  const filteredActiveTree = useMemo(
    () => filterWikiPageTree(activeTree, deferredSearchQuery),
    [activeTree, deferredSearchQuery],
  )
  const filteredArchivedTree = useMemo(
    () => filterWikiPageTree(archivedTree, deferredSearchQuery),
    [archivedTree, deferredSearchQuery],
  )
  const selectedPageDescendantIds = useMemo(
    () => (selectedPageId ? buildWikiDescendantIdSet(activePages, selectedPageId) : new Set<string>()),
    [activePages, selectedPageId],
  )
  const parentOptions = useMemo(
    () =>
      activePages.filter(
        (page) => page.page_id !== selectedPageId && !selectedPageDescendantIds.has(page.page_id),
      ),
    [activePages, selectedPageDescendantIds, selectedPageId],
  )
  const mentionablePages = useMemo(
    () => activePages.filter((page) => page.page_id !== selectedPageId),
    [activePages, selectedPageId],
  )
  const selectedNewPageTemplate = useMemo(
    () => resolveWikiPageTemplate(newPageTemplateKey),
    [newPageTemplateKey],
  )
  const pageLinkLookup = useMemo(() => {
    const lookup = new Map<string, WikiPageSummary>()
    pages.forEach((page) => {
      lookup.set(normalizeWikiLinkTarget(page.page_id), page)
      lookup.set(normalizeWikiLinkTarget(page.title), page)
    })
    return lookup
  }, [pages])
  const selectedPageBacklinks = useMemo<WikiBacklink[]>(() => {
    if (!selectedPageId) {
      return []
    }

    return pages
      .filter((page) => page.page_id !== selectedPageId)
      .map((page) => {
        const mentions = new Map<string, { label: string; target: string; snippet: string }>()
        const links = page.links ?? []

        links.forEach((link) => {
          const linkedPage = resolvePageFromLookup(pageLinkLookup, link.target)
          if (linkedPage?.page_id === selectedPageId) {
            const label = link.label || link.target
            const target = link.target
            const snippet = link.snippet?.trim() || page.summary
            const mentionKey = `${normalizeWikiLinkTarget(label)}:${normalizeWikiLinkTarget(target)}:${snippet}`
            mentions.set(mentionKey, { label, target, snippet })
          }
        })

        const backlinkMentions = [...mentions.values()]
        return {
          page,
          mentions: backlinkMentions,
          labels: backlinkMentions.map((mention) => mention.label || mention.target),
        }
      })
      .filter((backlink) => backlink.mentions.length > 0)
  }, [pageLinkLookup, pages, selectedPageId])
  const selectedPageUnresolvedLinks = useMemo<WikiUnresolvedLink[]>(() => {
    if (!selectedPage) {
      return []
    }

    const unresolvedLinks = new Map<string, WikiUnresolvedLink>()
    parseWikiMarkdownLinks(contentDraft).forEach((link) => {
      if (resolvePageFromLookup(pageLinkLookup, link.target)) {
        return
      }

      const key = unresolvedLinkKey(link)
      if (!unresolvedLinks.has(key)) {
        unresolvedLinks.set(key, link)
      }
    })

    return [...unresolvedLinks.values()]
  }, [contentDraft, pageLinkLookup, selectedPage])

  const hasAuth = authSession !== null
  const accessToken = authSession?.accessToken ?? ''
  const dirty =
    selectedPage !== null &&
    !selectedPage.is_archived &&
    (titleDraft !== selectedPage.title ||
      parentDraft !== (selectedPage.parent_page_id ?? '') ||
      contentDraft !== selectedPage.content_markdown)

  function hydrateSelectedPage(page: WikiPageDetail) {
    setSelectedPageId(page.page_id)
    setSelectedPage(page)
    setTitleDraft(page.title)
    setParentDraft(page.parent_page_id ?? '')
    setContentDraft(page.content_markdown)
    if (page.is_archived) {
      setShowArchived(true)
    }
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
      setShowArchived(false)
      setError('')
      setNotice('')
      return
    }

    let cancelled = false

    async function initializeWiki() {
      setLoading(true)
      setError('')

      try {
        const nextPages = await fetchWikiPageIndex(apiBase, accessToken)
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

        hydrateSelectedPage(page)
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

  useEffect(() => {
    if (!enabled || !accessToken || !hasRankedSearchQuery) {
      setSearchResults([])
      setSearching(false)
      setSearchError('')
      return
    }

    let cancelled = false

    async function searchWikiIndex() {
      setSearching(true)
      setSearchError('')

      try {
        const payload = await searchWikiPages(apiBase, accessToken, normalizedDeferredSearchQuery, {
          includeArchived: showArchived,
          limit: 8,
        })
        if (!cancelled) {
          setSearchResults(payload.results)
        }
      } catch (nextError: unknown) {
        if (!cancelled) {
          setSearchResults([])
          setSearchError(describeError(nextError))
        }
      } finally {
        if (!cancelled) {
          setSearching(false)
        }
      }
    }

    void searchWikiIndex()

    return () => {
      cancelled = true
    }
  }, [accessToken, apiBase, enabled, hasRankedSearchQuery, normalizedDeferredSearchQuery, showArchived])

  function confirmDiscardChanges(): boolean {
    if (!dirty || typeof window === 'undefined') {
      return true
    }
    return window.confirm('Discard unsaved wiki changes and open another page?')
  }

  function confirmArchivePage(): boolean {
    if (!selectedPage || typeof window === 'undefined') {
      return true
    }

    const archivedDescendantCount = selectedPageDescendantIds.size
    if (archivedDescendantCount === 0) {
      return window.confirm(`Archive '${selectedPage.title}'?`)
    }

    return window.confirm(
      `Archive '${selectedPage.title}' and its ${archivedDescendantCount.toLocaleString()} child page${archivedDescendantCount === 1 ? '' : 's'}?`,
    )
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

  async function handleCreatePage(
    parentPageId: string | null,
    templateKey: WikiPageTemplateKey = newPageTemplateKey,
  ) {
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
      const template = resolveWikiPageTemplate(templateKey)
      const templateDraft = buildWikiPageTemplateDraft(template.key)
      const createdPage = await createWikiPage(apiBase, authSession.accessToken, {
        title: templateDraft.title,
        parent_page_id: parentPageId,
        content_markdown: templateDraft.contentMarkdown,
      })
      setNotice(
        template.key === DEFAULT_WIKI_PAGE_TEMPLATE_KEY
          ? parentPageId
            ? 'Created a child wiki page.'
            : 'Created a new wiki page.'
          : parentPageId
            ? `Created a child wiki page from the ${template.label} template.`
            : `Created a new wiki page from the ${template.label} template.`,
      )
      hydrateSelectedPage(createdPage)
      setPages(await fetchWikiPageIndex(apiBase, accessToken))
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setCreatingParentId(null)
    }
  }

  async function handleCreatePageFromUnresolvedLink(link: WikiUnresolvedLink) {
    if (!authSession || !selectedPage || selectedPage.is_archived) {
      return
    }

    if (resolvePageFromLookup(pageLinkLookup, link.target)) {
      setError('That wiki link already resolves to an existing page.')
      return
    }

    const pageTitle = titleFromUnresolvedLink(link)
    if (!pageTitle) {
      setError('Choose a non-empty wiki link title before creating a page.')
      return
    }

    const linkKey = unresolvedLinkKey(link)
    setCreatingUnresolvedLinkKey(linkKey)
    setError('')
    setNotice('')

    try {
      const createdPage = await createWikiPage(apiBase, authSession.accessToken, {
        title: pageTitle,
        parent_page_id: selectedPage.page_id,
        content_markdown: '',
      })
      const nextContentDraft = rewriteWikiMarkdownLinkTarget(
        contentDraft,
        link,
        createdPage.page_id,
      )
      const updatedPage = await updateWikiPage(apiBase, authSession.accessToken, selectedPage.page_id, {
        title: titleDraft,
        parent_page_id: parentDraft || null,
        content_markdown: nextContentDraft,
      })

      hydrateSelectedPage(updatedPage)
      setPages(await fetchWikiPageIndex(apiBase, accessToken))
      setNotice(`Created '${createdPage.title}' and saved a stable wiki link.`)
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setCreatingUnresolvedLinkKey(null)
    }
  }

  async function handleSavePage() {
    if (!authSession || !selectedPage || selectedPage.is_archived || !dirty) {
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
      setPages(await fetchWikiPageIndex(apiBase, accessToken))
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

  async function handleArchivePage() {
    if (!authSession || !selectedPage || selectedPage.is_archived) {
      return
    }
    if (!confirmArchivePage()) {
      return
    }

    const archivedDescendantCount = selectedPageDescendantIds.size
    setArchivingPageId(selectedPage.page_id)
    setError('')
    setNotice('')

    try {
      const archivedPage = await archiveWikiPage(apiBase, authSession.accessToken, selectedPage.page_id)
      setShowArchived(true)
      hydrateSelectedPage(archivedPage)
      setPages(await fetchWikiPageIndex(apiBase, accessToken))
      setNotice(
        archivedDescendantCount > 0
          ? `Archived this page and ${archivedDescendantCount.toLocaleString()} child page${archivedDescendantCount === 1 ? '' : 's'}.`
          : 'Archived this wiki page.',
      )
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setArchivingPageId(null)
    }
  }

  async function handleRestoreArchivedPage() {
    if (!authSession || !selectedPage || !selectedPage.is_archived) {
      return
    }

    setRestoringArchivedPageId(selectedPage.page_id)
    setError('')
    setNotice('')

    try {
      const restoredPage = await restoreArchivedWikiPage(
        apiBase,
        authSession.accessToken,
        selectedPage.page_id,
      )
      hydrateSelectedPage(restoredPage)
      setPages(await fetchWikiPageIndex(apiBase, accessToken))
      setNotice('Restored this wiki page from archive.')
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setRestoringArchivedPageId(null)
    }
  }

  async function handleRestoreRevision(revisionId: number) {
    if (!authSession || !selectedPage || selectedPage.is_archived) {
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
      setPages(await fetchWikiPageIndex(apiBase, accessToken))
      setNotice(`Restored revision ${revisionId}.`)
    } catch (nextError: unknown) {
      setError(describeError(nextError))
    } finally {
      setRestoringRevisionId(null)
    }
  }

  function resolvePageByLinkTarget(target: string): WikiPageSummary | null {
    return resolvePageFromLookup(pageLinkLookup, target)
  }

  return {
    activePages,
    archivingPageId,
    archivedPages,
    contentDraft,
    creatingParentId,
    creatingUnresolvedLinkKey,
    dirty,
    error,
    filteredActiveTree,
    filteredArchivedTree,
    handleArchivePage,
    handleCreatePage,
    handleCreatePageFromUnresolvedLink,
    handleResetDraft,
    handleRestoreArchivedPage,
    handleRestoreRevision,
    handleSavePage,
    handleSelectPage,
    hasArchivedPages: archivedPages.length > 0,
    hasAuth,
    hasRankedSearchQuery,
    loading,
    mentionablePages,
    newPageTemplateKey,
    newPageTemplates: WIKI_PAGE_TEMPLATES,
    notice,
    pages,
    parentDraft,
    parentOptions,
    resolvePageByLinkTarget,
    restoringArchivedPageId,
    restoringRevisionId,
    saving,
    searchError,
    searchQuery,
    searchResults,
    searching,
    selectedPage,
    selectedPageBacklinks,
    selectedPageId,
    selectedNewPageTemplate,
    selectedPageUnresolvedLinks,
    setContentDraft,
    setError,
    setNotice,
    setParentDraft,
    setNewPageTemplateKey,
    setSearchQuery,
    setShowArchived,
    setTitleDraft,
    showArchived,
    titleDraft,
  }
}
