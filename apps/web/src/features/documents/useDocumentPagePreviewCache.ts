import { useEffect, useRef, useState } from 'react'
import { fetchDocumentPagePreview } from '../../entities/documents/api'
import { appConfig } from '../../shared/config'
import type { DocumentIngestionRecord } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import { documentNeedsProcessing } from './documentIngestionUtils'

type UseDocumentPagePreviewCacheArgs = {
  authSession: StoredAuthSession | null
  documents: DocumentIngestionRecord[]
  expandedDocumentIds: Record<string, boolean>
}

type DocumentPagePreviewCache = {
  pagePreviewUrls: Record<number, string>
  pagePreviewLoading: Record<number, boolean>
  pagePreviewErrors: Record<number, string>
  clearPagePreviewsForDocument: (documentId: string) => void
}

type DocumentPagePreviewTarget = {
  documentId: string
  pageId: number
}

export function documentPagePreviewCacheKey(documentId: string, pageId: number): string {
  return `${documentId}:${pageId}`
}

export function resolveDocumentPagePreviewTargets({
  documents,
  expandedDocumentIds,
  pagePreviewUrls,
  pagePreviewLoading,
  pagePreviewErrors,
  inFlightPagePreviewKeys,
}: {
  documents: DocumentIngestionRecord[]
  expandedDocumentIds: Record<string, boolean>
  pagePreviewUrls: Record<number, string>
  pagePreviewLoading: Record<number, boolean>
  pagePreviewErrors: Record<number, string>
  inFlightPagePreviewKeys: ReadonlySet<string>
}): DocumentPagePreviewTarget[] {
  return documents.flatMap((document) => {
    if (!expandedDocumentIds[document.document_id] || documentNeedsProcessing(document)) {
      return []
    }
    return document.pages
      .filter(
        (page) =>
          page.preview_available &&
          !pagePreviewUrls[page.page_id] &&
          !pagePreviewLoading[page.page_id] &&
          !pagePreviewErrors[page.page_id] &&
          !inFlightPagePreviewKeys.has(documentPagePreviewCacheKey(document.document_id, page.page_id)),
      )
      .map((page) => ({
        documentId: document.document_id,
        pageId: page.page_id,
      }))
  })
}

export function useDocumentPagePreviewCache({
  authSession,
  documents,
  expandedDocumentIds,
}: UseDocumentPagePreviewCacheArgs): DocumentPagePreviewCache {
  const [pagePreviewUrls, setPagePreviewUrls] = useState<Record<number, string>>({})
  const [pagePreviewLoading, setPagePreviewLoading] = useState<Record<number, boolean>>({})
  const [pagePreviewErrors, setPagePreviewErrors] = useState<Record<number, string>>({})
  const pagePreviewUrlsRef = useRef<Record<number, string>>({})
  const activeSessionIdRef = useRef<string | null>(authSession?.sessionId ?? null)
  const inFlightPagePreviewKeysRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(false)

  useEffect(() => {
    pagePreviewUrlsRef.current = pagePreviewUrls
  }, [pagePreviewUrls])

  useEffect(() => {
    const nextSessionId = authSession?.sessionId ?? null
    if (activeSessionIdRef.current === nextSessionId) {
      return
    }
    activeSessionIdRef.current = nextSessionId
    inFlightPagePreviewKeysRef.current.clear()
    queueMicrotask(() => {
      Object.values(pagePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
      pagePreviewUrlsRef.current = {}
      setPagePreviewUrls({})
      setPagePreviewLoading({})
      setPagePreviewErrors({})
    })
  }, [authSession])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      Object.values(pagePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (!authSession) {
      return
    }

    const requestSessionId = authSession.sessionId
    const targetPages = resolveDocumentPagePreviewTargets({
      documents,
      expandedDocumentIds,
      pagePreviewUrls,
      pagePreviewLoading,
      pagePreviewErrors,
      inFlightPagePreviewKeys: inFlightPagePreviewKeysRef.current,
    })

    if (targetPages.length === 0) {
      return
    }

    for (const page of targetPages) {
      inFlightPagePreviewKeysRef.current.add(documentPagePreviewCacheKey(page.documentId, page.pageId))
    }

    queueMicrotask(() => {
      if (!mountedRef.current || activeSessionIdRef.current !== requestSessionId) {
        return
      }
      const loadingPages = targetPages.filter((page) =>
        inFlightPagePreviewKeysRef.current.has(documentPagePreviewCacheKey(page.documentId, page.pageId)),
      )
      if (loadingPages.length === 0) {
        return
      }
      setPagePreviewLoading((current) => {
        const next = { ...current }
        for (const page of loadingPages) {
          next[page.pageId] = true
        }
        return next
      })
    })

    for (const page of targetPages) {
      const previewKey = documentPagePreviewCacheKey(page.documentId, page.pageId)
      void fetchDocumentPagePreview(appConfig.apiBase, authSession, page.documentId, page.pageId)
        .then((blob) => {
          if (
            !mountedRef.current ||
            activeSessionIdRef.current !== requestSessionId ||
            !inFlightPagePreviewKeysRef.current.has(previewKey)
          ) {
            return
          }
          const nextUrl = URL.createObjectURL(blob)
          if (
            !mountedRef.current ||
            activeSessionIdRef.current !== requestSessionId ||
            !inFlightPagePreviewKeysRef.current.has(previewKey)
          ) {
            URL.revokeObjectURL(nextUrl)
            return
          }
          setPagePreviewUrls((current) => {
            const previousUrl = current[page.pageId]
            if (previousUrl) {
              URL.revokeObjectURL(previousUrl)
            }
            return { ...current, [page.pageId]: nextUrl }
          })
          setPagePreviewErrors((current) => {
            if (!(page.pageId in current)) {
              return current
            }
            const next = { ...current }
            delete next[page.pageId]
            return next
          })
        })
        .catch((error) => {
          if (
            !mountedRef.current ||
            activeSessionIdRef.current !== requestSessionId ||
            !inFlightPagePreviewKeysRef.current.has(previewKey)
          ) {
            return
          }
          setPagePreviewErrors((current) => ({
            ...current,
            [page.pageId]: error instanceof Error ? error.message : 'Unable to load the page preview.',
          }))
        })
        .finally(() => {
          if (
            !mountedRef.current ||
            activeSessionIdRef.current !== requestSessionId ||
            !inFlightPagePreviewKeysRef.current.has(previewKey)
          ) {
            return
          }
          inFlightPagePreviewKeysRef.current.delete(previewKey)
          setPagePreviewLoading((current) => {
            if (!(page.pageId in current)) {
              return current
            }
            const next = { ...current }
            delete next[page.pageId]
            return next
          })
        })
    }
  }, [authSession, documents, expandedDocumentIds, pagePreviewErrors, pagePreviewLoading, pagePreviewUrls])

  function clearPagePreviewsForDocument(documentId: string) {
    const pageIds = documents.find((document) => document.document_id === documentId)?.pages.map((page) => page.page_id) ?? []
    if (pageIds.length === 0) {
      return
    }

    for (const pageId of pageIds) {
      inFlightPagePreviewKeysRef.current.delete(documentPagePreviewCacheKey(documentId, pageId))
    }

    setPagePreviewUrls((current) => {
      const next = { ...current }
      for (const pageId of pageIds) {
        if (next[pageId]) {
          URL.revokeObjectURL(next[pageId])
          delete next[pageId]
        }
      }
      return next
    })
    setPagePreviewLoading((current) => {
      const next = { ...current }
      for (const pageId of pageIds) {
        delete next[pageId]
      }
      return next
    })
    setPagePreviewErrors((current) => {
      const next = { ...current }
      for (const pageId of pageIds) {
        delete next[pageId]
      }
      return next
    })
  }

  return {
    pagePreviewUrls,
    pagePreviewLoading,
    pagePreviewErrors,
    clearPagePreviewsForDocument,
  }
}
