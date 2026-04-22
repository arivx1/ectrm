import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { submitReferenceMutation } from '../../entities/reference-data/api'
import type { BookForm, ReferenceRecord } from '../../shared/models'
import { emptyBookForm, type useReferenceDataWorkspace } from './useReferenceDataWorkspace'
import {
  buildBookFieldErrors,
  isBookFormDirty,
} from './referenceDataFormState'
import {
  buildBookForm,
  type BookPasteSummary,
  sameText,
  stageBooksFromPasteInput,
  validateBookSheetForm,
} from './referenceDataHelpers'

type ReferenceDataWorkspaceState = ReturnType<typeof useReferenceDataWorkspace>

type BookSheetField = 'name' | 'description'

type BookSheetRow = ReferenceRecord & {
  description: string
  sheet_mode: 'create' | 'update'
  sheet_dirty: boolean
  sheet_error: string
}

type UseReferenceDataBookControllerArgs = {
  apiBase: string
  reloadData: () => Promise<void>
  books: ReferenceRecord[]
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'referenceSearch'
    | 'selectedBookCode'
    | 'setSelectedBookCode'
    | 'filteredBooks'
    | 'bookForm'
    | 'setBookForm'
    | 'bookFormMode'
    | 'setBookFormMode'
    | 'selectedBook'
    | 'startCreateBook'
    | 'startEditBook'
  >
  bookUsageByCode: Map<string, { activeTrades: number; totalTrades: number }>
  beginReferenceAction: (action: () => void) => void
  resetReferenceMessages: () => void
  currentActorId: () => string
  setReferenceActionError: Dispatch<SetStateAction<string>>
  setReferenceActionSuccess: Dispatch<SetStateAction<string>>
  setSavingReference: Dispatch<SetStateAction<boolean>>
  submitReference: (
    path: string,
    method: 'POST' | 'PUT',
    payload: Record<string, unknown>,
    successMessage: string,
  ) => Promise<void>
}

export function useReferenceDataBookController({
  apiBase,
  reloadData,
  books,
  workspace,
  bookUsageByCode,
  beginReferenceAction,
  resetReferenceMessages,
  currentActorId,
  setReferenceActionError,
  setReferenceActionSuccess,
  setSavingReference,
  submitReference,
}: UseReferenceDataBookControllerArgs) {
  const [bookSheetDrafts, setBookSheetDrafts] = useState<Record<string, BookForm>>({})
  const [bookSheetApplyErrors, setBookSheetApplyErrors] = useState<Record<string, string>>({})
  const [bookPasteInput, setBookPasteInput] = useState('')
  const [bookPasteSummary, setBookPasteSummary] = useState<BookPasteSummary | null>(null)

  const {
    referenceSearch,
    selectedBookCode,
    setSelectedBookCode,
    filteredBooks,
    bookForm,
    setBookForm,
    bookFormMode,
    setBookFormMode,
    selectedBook,
    startCreateBook: startCreateBookBase,
    startEditBook: startEditBookBase,
  } = workspace

  function resolveBookSheetForm(code: string): BookForm | null {
    const draft = bookSheetDrafts[code]
    if (draft) {
      return draft
    }

    const record = books.find((book) => book.code === code)
    if (!record) {
      return null
    }

    return buildBookForm(record)
  }

  const bookSheetRows = useMemo<BookSheetRow[]>(
    () => {
      const query = referenceSearch.trim().toLowerCase()
      const existingRows = filteredBooks.map((book) => {
        const draft = bookSheetDrafts[book.code]
        const rowForm = draft ?? buildBookForm(book)
        return {
          ...book,
          name: rowForm.name,
          description: rowForm.description,
          sheet_mode: 'update' as const,
          sheet_dirty: draft !== undefined,
          sheet_error: validateBookSheetForm(rowForm) || bookSheetApplyErrors[book.code] || '',
        }
      })
      const createdRows = Object.values(bookSheetDrafts)
        .filter((draft) => !books.some((book) => book.code === draft.code))
        .filter((draft) => {
          if (!query) {
            return true
          }

          return (
            draft.code.toLowerCase().includes(query) ||
            draft.name.toLowerCase().includes(query) ||
            draft.description.toLowerCase().includes(query)
          )
        })
        .map((draft) => ({
          code: draft.code,
          name: draft.name,
          description: draft.description,
          is_active: true,
          sheet_mode: 'create' as const,
          sheet_dirty: true,
          sheet_error: validateBookSheetForm(draft) || bookSheetApplyErrors[draft.code] || '',
        }))

      return [...createdRows, ...existingRows]
    },
    [bookSheetApplyErrors, bookSheetDrafts, books, filteredBooks, referenceSearch],
  )

  const bookSheetDirtyCount = useMemo(
    () => Object.keys(bookSheetDrafts).length,
    [bookSheetDrafts],
  )

  const bookSheetInvalidCount = useMemo(
    () =>
      Object.values(bookSheetDrafts).filter((draft) => Boolean(validateBookSheetForm(draft) || bookSheetApplyErrors[draft.code])).length,
    [bookSheetApplyErrors, bookSheetDrafts],
  )

  const bookFieldErrors = useMemo(
    () => buildBookFieldErrors(bookForm, bookFormMode, books),
    [bookForm, bookFormMode, books],
  )

  const bookFormDirty = useMemo(
    () => isBookFormDirty(bookForm, bookFormMode, selectedBook),
    [bookForm, bookFormMode, selectedBook],
  )

  function clearBookSheetDraft(code: string) {
    setBookSheetDrafts((current) => {
      if (!(code in current)) {
        return current
      }

      const next = { ...current }
      delete next[code]
      return next
    })
    setBookSheetApplyErrors((current) => {
      if (!(code in current)) {
        return current
      }

      const next = { ...current }
      delete next[code]
      return next
    })
  }

  function updateBookSheetField(code: string, field: BookSheetField, value: string) {
    const record = books.find((book) => book.code === code)
    const currentDraft = resolveBookSheetForm(code)
    if (!currentDraft) {
      return
    }

    resetReferenceMessages()
    setBookSheetApplyErrors((current) => {
      if (!(code in current)) {
        return current
      }

      const next = { ...current }
      delete next[code]
      return next
    })

    const nextDraft = {
      ...currentDraft,
      [field]: value,
    }
    const hasChanges =
      !record ||
      !sameText(nextDraft.name, record.name) ||
      !sameText(nextDraft.description, record.description)

    setBookSheetDrafts((current) => {
      const next = { ...current }
      if (hasChanges) {
        next[code] = nextDraft
      } else {
        delete next[code]
      }
      return next
    })

    if (selectedBook?.code === code && bookFormMode === 'edit') {
      setBookForm(nextDraft)
    }
  }

  function resetBookSheetRow(code: string) {
    const record = books.find((book) => book.code === code)
    resetReferenceMessages()
    clearBookSheetDraft(code)

    if (record && selectedBook?.code === code && bookFormMode === 'edit') {
      setBookForm(buildBookForm(record))
      return
    }

    if (!record && selectedBookCode === code && bookFormMode === 'create') {
      setSelectedBookCode(null)
      setBookForm(emptyBookForm())
    }
  }

  function resetAllBookSheetChanges() {
    resetReferenceMessages()
    setBookSheetDrafts({})
    setBookSheetApplyErrors({})

    if (selectedBook && bookFormMode === 'edit') {
      setBookForm(buildBookForm(selectedBook))
      return
    }

    if (selectedBookCode && !selectedBook && bookFormMode === 'create') {
      setSelectedBookCode(null)
      setBookForm(emptyBookForm())
    }
  }

  function clearBookPasteState() {
    setBookPasteInput('')
    setBookPasteSummary(null)
  }

  function stageBooksFromPaste(input: string) {
    resetReferenceMessages()
    const result = stageBooksFromPasteInput({
      input,
      books,
      existingDrafts: bookSheetDrafts,
      existingApplyErrors: bookSheetApplyErrors,
    })

    setBookSheetDrafts(result.nextDrafts)
    setBookSheetApplyErrors(result.nextApplyErrors)
    setBookPasteSummary(result.summary)

    if (selectedBook && bookFormMode === 'edit') {
      const selectedDraft = result.nextDrafts[selectedBook.code]
      setBookForm(selectedDraft ?? buildBookForm(selectedBook))
    } else if (selectedBookCode && !selectedBook && bookFormMode === 'create') {
      const selectedDraft = result.nextDrafts[selectedBookCode]
      if (selectedDraft) {
        setBookForm(selectedDraft)
      }
    }

    setReferenceActionSuccess(result.successMessage)
    setReferenceActionError(result.errorMessage)
  }

  async function applyBookSheetChanges(targetCodes?: string[]) {
    const candidateCodes = targetCodes?.length
      ? targetCodes
      : Object.keys(bookSheetDrafts)
    const dirtyCodes = candidateCodes.filter((code, index) => candidateCodes.indexOf(code) === index && bookSheetDrafts[code])

    if (dirtyCodes.length === 0) {
      setReferenceActionError('There are no staged book changes to apply.')
      setReferenceActionSuccess('')
      return
    }

    setSavingReference(true)
    resetReferenceMessages()

    const nextDrafts = { ...bookSheetDrafts }
    const nextApplyErrors = { ...bookSheetApplyErrors }
    const actorId = currentActorId()
    let successCount = 0
    const successfulDrafts: Record<string, BookForm> = {}

    try {
      for (const code of dirtyCodes) {
        const draft = nextDrafts[code]
        if (!draft) {
          continue
        }

        const validationError = validateBookSheetForm(draft)
        if (validationError) {
          nextApplyErrors[code] = validationError
          continue
        }

        try {
          const existingRecord = books.find((book) => book.code === code)
          if (existingRecord) {
            await submitReferenceMutation(
              apiBase,
              `/reference/books/${code}`,
              'PUT',
              {
                name: draft.name.trim(),
                description: draft.description.trim() || null,
                updated_by: actorId,
              },
            )
          } else {
            await submitReferenceMutation(
              apiBase,
              '/reference/books',
              'POST',
              {
                code,
                name: draft.name.trim(),
                description: draft.description.trim() || null,
                created_by: actorId,
              },
            )
          }
          successfulDrafts[code] = draft
          delete nextDrafts[code]
          delete nextApplyErrors[code]
          successCount += 1
        } catch (err) {
          nextApplyErrors[code] = err instanceof Error ? err.message : 'Book update failed.'
        }
      }

      setBookSheetDrafts(nextDrafts)
      setBookSheetApplyErrors(nextApplyErrors)

      if (successCount > 0) {
        await reloadData()
        if (selectedBookCode && successfulDrafts[selectedBookCode]) {
          setSelectedBookCode(selectedBookCode)
          setBookFormMode('edit')
          setBookForm(successfulDrafts[selectedBookCode])
        }
      }

      const failureCount = Object.keys(nextApplyErrors).filter((code) => dirtyCodes.includes(code)).length
      if (successCount > 0 && failureCount === 0) {
        setReferenceActionSuccess(`Applied ${successCount} staged book ${successCount === 1 ? 'change' : 'changes'}.`)
        return
      }

      if (successCount > 0) {
        setReferenceActionSuccess(`Applied ${successCount} staged book ${successCount === 1 ? 'change' : 'changes'}.`)
        setReferenceActionError(`${failureCount} row${failureCount === 1 ? '' : 's'} still need attention before they can be applied.`)
        return
      }

      setReferenceActionError('No staged book changes were applied. Review the highlighted rows and try again.')
    } finally {
      setSavingReference(false)
    }
  }

  function startCreateBook() {
    beginReferenceAction(() => {
      setSelectedBookCode(null)
      startCreateBookBase()
    })
  }

  function startEditBook(code: string) {
    beginReferenceAction(() => {
      const draft = resolveBookSheetForm(code)
      const record = books.find((book) => book.code === code)
      if (record) {
        startEditBookBase(code)
        if (draft) {
          setBookForm(draft)
        }
        return
      }

      if (draft) {
        setSelectedBookCode(code)
        setBookFormMode('create')
        setBookForm(draft)
      }
    })
  }

  async function handleSaveBook(e: React.FormEvent) {
    e.preventDefault()
    if (!bookForm.code.trim() || !bookForm.name.trim()) {
      setReferenceActionError('Book code and name are required.')
      return
    }

    if (bookFormMode === 'create') {
      const code = bookForm.code.trim().toUpperCase()
      const stagedDraftCode = selectedBookCode && !selectedBook ? selectedBookCode : null
      await submitReference(
        '/reference/books',
        'POST',
        { code, name: bookForm.name.trim(), description: bookForm.description.trim() || null, created_by: currentActorId() },
        `Book ${code} created.`,
      )
      if (stagedDraftCode) {
        clearBookSheetDraft(stagedDraftCode)
      }
      startEditBookBase(code)
    } else if (selectedBook) {
      await submitReference(
        `/reference/books/${selectedBook.code}`,
        'PUT',
        { name: bookForm.name.trim(), description: bookForm.description.trim() || null, updated_by: currentActorId() },
        `Book ${selectedBook.code} updated.`,
      )
      clearBookSheetDraft(selectedBook.code)
    }
  }

  async function handleToggleBook(record: ReferenceRecord) {
    const usage = bookUsageByCode.get(record.code) ?? { activeTrades: 0, totalTrades: 0 }
    if (record.is_active && usage.activeTrades > 0) {
      setReferenceActionError(
        `Book ${record.code} is used by ${usage.activeTrades} active trade${usage.activeTrades === 1 ? '' : 's'}. Reassign or cancel them before deactivating.`,
      )
      setReferenceActionSuccess('')
      return
    }

    await submitReference(
      `/reference/books/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: currentActorId() },
      `Book ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  return {
    bookPasteInput,
    setBookPasteInput,
    bookPasteSummary,
    bookSheetRows,
    bookSheetDirtyCount,
    bookSheetInvalidCount,
    bookFieldErrors,
    bookFormDirty,
    startCreateBook,
    startEditBook,
    updateBookSheetField,
    stageBooksFromPaste,
    clearBookPasteState,
    applyBookSheetChanges,
    resetBookSheetRow,
    resetAllBookSheetChanges,
    handleSaveBook,
    handleToggleBook,
  }
}
