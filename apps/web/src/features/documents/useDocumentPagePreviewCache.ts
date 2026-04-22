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

export function useDocumentPagePreviewCache({
  authSession,
  documents,
  expandedDocumentIds,
}: UseDocumentPagePreviewCacheArgs): DocumentPagePreviewCache {
  const [pagePreviewUrls, setPagePreviewUrls] = useState<Record<number, string>>({})
  const [pagePreviewLoading, setPagePreviewLoading] = useState<Record<number, boolean>>({})
  const [pagePreviewErrors, setPagePreviewErrors] = useState<Record<number, string>>({})
  const pagePreviewUrlsRef = useRef<Record<number, string>>({})

  useEffect(() => {
    pagePreviewUrlsRef.current = pagePreviewUrls
  }, [pagePreviewUrls])

  useEffect(() => {
    if (authSession) {
      return
    }
    queueMicrotask(() => {
      Object.values(pagePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
      pagePreviewUrlsRef.current = {}
      setPagePreviewUrls({})
      setPagePreviewLoading({})
      setPagePreviewErrors({})
    })
  }, [authSession])

  useEffect(() => {
    return () => {
      Object.values(pagePreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (!authSession) {
      return
    }

    const targetPages = documents.flatMap((document) => {
      if (!expandedDocumentIds[document.document_id] || documentNeedsProcessing(document)) {
        return []
      }
      return document.pages
        .filter(
          (page) =>
            page.preview_available &&
            !pagePreviewUrls[page.page_id] &&
            !pagePreviewLoading[page.page_id] &&
            !pagePreviewErrors[page.page_id],
        )
        .map((page) => ({
          documentId: document.document_id,
          pageId: page.page_id,
        }))
    })

    if (targetPages.length === 0) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      setPagePreviewLoading((current) => {
        const next = { ...current }
        for (const page of targetPages) {
          next[page.pageId] = true
        }
        return next
      })
    })

    for (const page of targetPages) {
      void fetchDocumentPagePreview(appConfig.apiBase, authSession, page.documentId, page.pageId)
        .then((blob) => {
          if (cancelled) {
            return
          }
          const nextUrl = URL.createObjectURL(blob)
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
          if (cancelled) {
            return
          }
          setPagePreviewErrors((current) => ({
            ...current,
            [page.pageId]: error instanceof Error ? error.message : 'Unable to load the page preview.',
          }))
        })
        .finally(() => {
          if (cancelled) {
            return
          }
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

    return () => {
      cancelled = true
    }
  }, [authSession, documents, expandedDocumentIds, pagePreviewErrors, pagePreviewLoading, pagePreviewUrls])

  function clearPagePreviewsForDocument(documentId: string) {
    const pageIds = documents.find((document) => document.document_id === documentId)?.pages.map((page) => page.page_id) ?? []
    if (pageIds.length === 0) {
      return
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
