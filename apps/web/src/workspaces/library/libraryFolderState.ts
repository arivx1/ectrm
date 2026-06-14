import { useCallback, useSyncExternalStore } from 'react'

const DOCUMENT_LIBRARY_FOLDER_STORAGE_KEY = 'ectrm.document-library-folders'
const DOCUMENT_LIBRARY_FOLDER_STORAGE_EVENT = 'ectrm:document-library-folders-change'
const EMPTY_DOCUMENT_LIBRARY_FOLDER_SNAPSHOT: DocumentLibraryFolderSnapshot = {
  folders: [],
  assignments: {},
}

let cachedSnapshotRawValue: string | null = null
let cachedSnapshot: DocumentLibraryFolderSnapshot = EMPTY_DOCUMENT_LIBRARY_FOLDER_SNAPSHOT

export type DocumentLibraryCustomFolder = {
  id: string
  name: string
  createdAt: string
  parentFolderId: string | null
}

export type DocumentLibraryFolderAssignments = Record<string, string>

export type DocumentLibraryFolderSnapshot = {
  folders: DocumentLibraryCustomFolder[]
  assignments: DocumentLibraryFolderAssignments
}

export type CreateDocumentLibraryFolderResult =
  | {
      ok: true
      folder: DocumentLibraryCustomFolder
    }
  | {
      ok: false
      error: string
    }

export type MoveDocumentLibraryFolderResult =
  | {
      ok: true
      snapshot: DocumentLibraryFolderSnapshot
      folder: DocumentLibraryCustomFolder
    }
  | {
      ok: false
      error: string
    }

export type CopyDocumentLibraryFolderResult =
  | {
      ok: true
      snapshot: DocumentLibraryFolderSnapshot
      folder: DocumentLibraryCustomFolder
      createdFolderCount: number
    }
  | {
      ok: false
      error: string
    }

export type RenameDocumentLibraryFolderResult =
  | {
      ok: true
      snapshot: DocumentLibraryFolderSnapshot
      folder: DocumentLibraryCustomFolder
    }
  | {
      ok: false
      error: string
    }

export type DeleteDocumentLibraryFolderResult =
  | {
      ok: true
      snapshot: DocumentLibraryFolderSnapshot
      deletedFolderIds: string[]
      deletedFolderCount: number
      unassignedDocumentCount: number
    }
  | {
      ok: false
      error: string
    }

function normalizeFolderName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function isDocumentLibraryCustomFolder(value: unknown): value is DocumentLibraryCustomFolder {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'string' &&
    (candidate.parentFolderId === null || typeof candidate.parentFolderId === 'string' || candidate.parentFolderId === undefined)
  )
}

function normalizeParentFolderId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function normalizeDocumentLibraryFolderSnapshot(value: unknown): DocumentLibraryFolderSnapshot {
  if (!value || typeof value !== 'object') {
    return {
      folders: [],
      assignments: {},
    }
  }

  const candidate = value as Record<string, unknown>
  const folders = Array.isArray(candidate.folders)
    ? candidate.folders
        .filter(isDocumentLibraryCustomFolder)
        .map((folder) => ({
          id: folder.id,
          name: normalizeFolderName(folder.name),
          createdAt: folder.createdAt,
          parentFolderId: normalizeParentFolderId(folder.parentFolderId),
        }))
        .filter((folder) => folder.id && folder.name)
    : []
  const validFolderIds = new Set(folders.map((folder) => folder.id))
  const normalizedFolders = folders.map((folder) => ({
    ...folder,
    parentFolderId:
      folder.parentFolderId && validFolderIds.has(folder.parentFolderId)
        ? folder.parentFolderId
        : null,
  }))
  const assignments =
    candidate.assignments && typeof candidate.assignments === 'object'
      ? Object.fromEntries(
          Object.entries(candidate.assignments).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === 'string' &&
              typeof entry[1] === 'string' &&
              validFolderIds.has(entry[1]),
          ),
        )
      : {}

  return {
    folders: normalizedFolders,
    assignments,
  }
}

function buildFolderChildrenByParent(
  folders: DocumentLibraryCustomFolder[],
): Map<string | null, DocumentLibraryCustomFolder[]> {
  const childrenByParent = new Map<string | null, DocumentLibraryCustomFolder[]>()

  folders.forEach((folder) => {
    const siblings = childrenByParent.get(folder.parentFolderId) ?? []
    siblings.push(folder)
    childrenByParent.set(folder.parentFolderId, siblings)
  })

  return childrenByParent
}

function buildDocumentLibraryFolderDescendantIds(
  folderId: string,
  folders: DocumentLibraryCustomFolder[],
): Set<string> {
  const childrenByParent = buildFolderChildrenByParent(folders)
  const descendantIds = new Set<string>()
  const queue = [folderId]

  while (queue.length > 0) {
    const nextFolderId = queue.shift()
    if (!nextFolderId || descendantIds.has(nextFolderId)) {
      continue
    }

    descendantIds.add(nextFolderId)
    ;(childrenByParent.get(nextFolderId) ?? []).forEach((childFolder) => {
      if (!descendantIds.has(childFolder.id)) {
        queue.push(childFolder.id)
      }
    })
  }

  return descendantIds
}

function folderExists(
  folders: DocumentLibraryCustomFolder[],
  folderId: string | null,
): boolean {
  if (!folderId) {
    return true
  }

  return folders.some((folder) => folder.id === folderId)
}

function folderNameExistsAtLevel(
  folders: DocumentLibraryCustomFolder[],
  folderName: string,
  parentFolderId: string | null,
  ignoredFolderId?: string,
): boolean {
  const normalizedFolderName = normalizeFolderName(folderName).toLowerCase()

  return folders.some(
    (folder) =>
      folder.id !== ignoredFolderId &&
      folder.parentFolderId === parentFolderId &&
      folder.name.toLowerCase() === normalizedFolderName,
  )
}

function buildFolderCopyName(
  folders: DocumentLibraryCustomFolder[],
  folderName: string,
  parentFolderId: string | null,
): string {
  const normalizedFolderName = normalizeFolderName(folderName)
  let copyIndex = 1

  while (true) {
    const candidateName =
      copyIndex === 1
        ? `${normalizedFolderName} Copy`
        : `${normalizedFolderName} Copy ${copyIndex}`

    if (!folderNameExistsAtLevel(folders, candidateName, parentFolderId)) {
      return candidateName
    }

    copyIndex += 1
  }
}

function buildDocumentLibraryFolderId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `library-folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function moveDocumentLibraryFolderTree(
  snapshot: DocumentLibraryFolderSnapshot,
  folderId: string,
  parentFolderId: string | null,
): MoveDocumentLibraryFolderResult {
  const normalizedSnapshot = normalizeDocumentLibraryFolderSnapshot(snapshot)
  const folder = normalizedSnapshot.folders.find((candidate) => candidate.id === folderId)

  if (!folder) {
    return {
      ok: false,
      error: 'That folder could not be found.',
    }
  }

  if (!folderExists(normalizedSnapshot.folders, parentFolderId)) {
    return {
      ok: false,
      error: 'The destination folder no longer exists.',
    }
  }

  if (parentFolderId === folder.id) {
    return {
      ok: false,
      error: 'A folder cannot be moved into itself.',
    }
  }

  const descendantIds = buildDocumentLibraryFolderDescendantIds(folder.id, normalizedSnapshot.folders)
  if (parentFolderId && descendantIds.has(parentFolderId)) {
    return {
      ok: false,
      error: 'A folder cannot be moved into one of its own subfolders.',
    }
  }

  if (folder.parentFolderId === parentFolderId) {
    return {
      ok: true,
      snapshot: normalizedSnapshot,
      folder,
    }
  }

  if (
    folderNameExistsAtLevel(
      normalizedSnapshot.folders,
      folder.name,
      parentFolderId,
      folder.id,
    )
  ) {
    return {
      ok: false,
      error: `A folder named "${folder.name}" already exists there.`,
    }
  }

  const nextFolder = {
    ...folder,
    parentFolderId,
  }

  return {
    ok: true,
    snapshot: {
      ...normalizedSnapshot,
      folders: normalizedSnapshot.folders.map((candidate) =>
        candidate.id === folder.id ? nextFolder : candidate,
      ),
    },
    folder: nextFolder,
  }
}

export function copyDocumentLibraryFolderTree(
  snapshot: DocumentLibraryFolderSnapshot,
  folderId: string,
  parentFolderId: string | null,
  options?: {
    createdAt?: string
    idFactory?: () => string
  },
): CopyDocumentLibraryFolderResult {
  const normalizedSnapshot = normalizeDocumentLibraryFolderSnapshot(snapshot)
  const sourceFolder = normalizedSnapshot.folders.find((candidate) => candidate.id === folderId)

  if (!sourceFolder) {
    return {
      ok: false,
      error: 'That folder could not be found.',
    }
  }

  if (!folderExists(normalizedSnapshot.folders, parentFolderId)) {
    return {
      ok: false,
      error: 'The destination folder no longer exists.',
    }
  }

  const childrenByParent = buildFolderChildrenByParent(normalizedSnapshot.folders)
  const createdAt = options?.createdAt ?? new Date().toISOString()
  const idFactory = options?.idFactory ?? buildDocumentLibraryFolderId
  const copiedFolders: DocumentLibraryCustomFolder[] = []

  const cloneFolder = (
    folder: DocumentLibraryCustomFolder,
    nextParentFolderId: string | null,
    nextFolderName: string,
  ) => {
    const nextFolderId = idFactory()
    const nextFolder: DocumentLibraryCustomFolder = {
      id: nextFolderId,
      name: nextFolderName,
      createdAt,
      parentFolderId: nextParentFolderId,
    }

    copiedFolders.push(nextFolder)

    ;(childrenByParent.get(folder.id) ?? []).forEach((childFolder) => {
      cloneFolder(childFolder, nextFolderId, childFolder.name)
    })
  }

  cloneFolder(
    sourceFolder,
    parentFolderId,
    buildFolderCopyName(normalizedSnapshot.folders, sourceFolder.name, parentFolderId),
  )

  return {
    ok: true,
    snapshot: {
      ...normalizedSnapshot,
      folders: [...normalizedSnapshot.folders, ...copiedFolders],
    },
    folder: copiedFolders[0],
    createdFolderCount: copiedFolders.length,
  }
}

export function renameDocumentLibraryFolder(
  snapshot: DocumentLibraryFolderSnapshot,
  folderId: string,
  name: string,
): RenameDocumentLibraryFolderResult {
  const normalizedSnapshot = normalizeDocumentLibraryFolderSnapshot(snapshot)
  const folder = normalizedSnapshot.folders.find((candidate) => candidate.id === folderId)

  if (!folder) {
    return {
      ok: false,
      error: 'That folder could not be found.',
    }
  }

  const normalizedName = normalizeFolderName(name)
  if (!normalizedName) {
    return {
      ok: false,
      error: 'Enter a folder name.',
    }
  }

  if (
    folderNameExistsAtLevel(
      normalizedSnapshot.folders,
      normalizedName,
      folder.parentFolderId,
      folder.id,
    )
  ) {
    return {
      ok: false,
      error: 'A folder with that name already exists here.',
    }
  }

  const nextFolder = {
    ...folder,
    name: normalizedName,
  }

  return {
    ok: true,
    snapshot: {
      ...normalizedSnapshot,
      folders: normalizedSnapshot.folders.map((candidate) =>
        candidate.id === folder.id ? nextFolder : candidate,
      ),
    },
    folder: nextFolder,
  }
}

export function deleteDocumentLibraryFolderTree(
  snapshot: DocumentLibraryFolderSnapshot,
  folderId: string,
): DeleteDocumentLibraryFolderResult {
  const normalizedSnapshot = normalizeDocumentLibraryFolderSnapshot(snapshot)
  const folder = normalizedSnapshot.folders.find((candidate) => candidate.id === folderId)

  if (!folder) {
    return {
      ok: false,
      error: 'That folder could not be found.',
    }
  }

  const deletedFolderIds = buildDocumentLibraryFolderDescendantIds(
    folder.id,
    normalizedSnapshot.folders,
  )
  const nextAssignments: DocumentLibraryFolderAssignments = {}
  let unassignedDocumentCount = 0

  Object.entries(normalizedSnapshot.assignments).forEach(([documentId, assignedFolderId]) => {
    if (deletedFolderIds.has(assignedFolderId)) {
      unassignedDocumentCount += 1
      return
    }

    nextAssignments[documentId] = assignedFolderId
  })

  return {
    ok: true,
    snapshot: {
      folders: normalizedSnapshot.folders.filter((candidate) => !deletedFolderIds.has(candidate.id)),
      assignments: nextAssignments,
    },
    deletedFolderIds: Array.from(deletedFolderIds),
    deletedFolderCount: deletedFolderIds.size,
    unassignedDocumentCount,
  }
}

export function getDocumentLibraryFolderSnapshot(): DocumentLibraryFolderSnapshot {
  if (typeof window === 'undefined') {
    return EMPTY_DOCUMENT_LIBRARY_FOLDER_SNAPSHOT
  }

  const storedValue = window.localStorage.getItem(DOCUMENT_LIBRARY_FOLDER_STORAGE_KEY)
  if (!storedValue) {
    cachedSnapshotRawValue = null
    cachedSnapshot = EMPTY_DOCUMENT_LIBRARY_FOLDER_SNAPSHOT
    return cachedSnapshot
  }

  if (storedValue === cachedSnapshotRawValue) {
    return cachedSnapshot
  }

  try {
    cachedSnapshotRawValue = storedValue
    cachedSnapshot = normalizeDocumentLibraryFolderSnapshot(JSON.parse(storedValue))
    return cachedSnapshot
  } catch {
    cachedSnapshotRawValue = null
    cachedSnapshot = EMPTY_DOCUMENT_LIBRARY_FOLDER_SNAPSHOT
    return cachedSnapshot
  }
}

function saveDocumentLibraryFolderSnapshot(
  snapshot: DocumentLibraryFolderSnapshot,
): DocumentLibraryFolderSnapshot {
  const normalizedSnapshot = normalizeDocumentLibraryFolderSnapshot(snapshot)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      DOCUMENT_LIBRARY_FOLDER_STORAGE_KEY,
      JSON.stringify(normalizedSnapshot),
    )
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(DOCUMENT_LIBRARY_FOLDER_STORAGE_EVENT))
    }
  }

  return normalizedSnapshot
}

function subscribeToDocumentLibraryFolderState(onStoreChange: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function' ||
    typeof window.removeEventListener !== 'function'
  ) {
    return () => undefined
  }

  const handleStoreEvent = (event: Event) => {
    if (event.type === 'storage') {
      const storageEvent = event as StorageEvent
      if (
        typeof storageEvent.key === 'string' &&
        storageEvent.key !== DOCUMENT_LIBRARY_FOLDER_STORAGE_KEY
      ) {
        return
      }
    }

    onStoreChange()
  }

  window.addEventListener(DOCUMENT_LIBRARY_FOLDER_STORAGE_EVENT, handleStoreEvent)
  window.addEventListener('storage', handleStoreEvent)

  return () => {
    window.removeEventListener(DOCUMENT_LIBRARY_FOLDER_STORAGE_EVENT, handleStoreEvent)
    window.removeEventListener('storage', handleStoreEvent)
  }
}

export function useDocumentLibraryFolderState(): {
  folders: DocumentLibraryCustomFolder[]
  assignments: DocumentLibraryFolderAssignments
  createFolder: (
    name: string,
    parentFolderId?: string | null,
  ) => CreateDocumentLibraryFolderResult
  moveFolder: (
    folderId: string,
    parentFolderId: string | null,
  ) => MoveDocumentLibraryFolderResult
  copyFolder: (
    folderId: string,
    parentFolderId: string | null,
  ) => CopyDocumentLibraryFolderResult
  renameFolder: (folderId: string, name: string) => RenameDocumentLibraryFolderResult
  deleteFolder: (folderId: string) => DeleteDocumentLibraryFolderResult
  assignDocumentToFolder: (documentId: string, folderId: string | null) => void
  assignDocumentsToFolder: (documentIds: string[], folderId: string | null) => void
} {
  const snapshot = useSyncExternalStore(
    subscribeToDocumentLibraryFolderState,
    getDocumentLibraryFolderSnapshot,
    () => EMPTY_DOCUMENT_LIBRARY_FOLDER_SNAPSHOT,
  )

  const createFolder = useCallback(
    (
      name: string,
      parentFolderId: string | null = null,
    ): CreateDocumentLibraryFolderResult => {
      const normalizedName = normalizeFolderName(name)

      if (!normalizedName) {
        return {
          ok: false,
          error: 'Enter a folder name.',
        }
      }

      const currentSnapshot = getDocumentLibraryFolderSnapshot()
      const normalizedParentFolderId =
        parentFolderId &&
        currentSnapshot.folders.some((folder) => folder.id === parentFolderId)
          ? parentFolderId
          : null
      if (
        currentSnapshot.folders.some(
          (folder) =>
            folder.parentFolderId === normalizedParentFolderId &&
            folder.name.toLowerCase() === normalizedName.toLowerCase(),
        )
      ) {
        return {
          ok: false,
          error: 'A folder with that name already exists here.',
        }
      }

      const folder: DocumentLibraryCustomFolder = {
        id: buildDocumentLibraryFolderId(),
        name: normalizedName,
        createdAt: new Date().toISOString(),
        parentFolderId: normalizedParentFolderId,
      }

      saveDocumentLibraryFolderSnapshot({
        ...currentSnapshot,
        folders: [...currentSnapshot.folders, folder],
      })

      return {
        ok: true,
        folder,
      }
    },
    [],
  )

  const assignDocumentsToFolder = useCallback(
    (documentIds: string[], folderId: string | null) => {
      const nextDocumentIds = documentIds
        .map((documentId) => documentId.trim())
        .filter(Boolean)

      if (nextDocumentIds.length === 0) {
        return
      }

      const currentSnapshot = getDocumentLibraryFolderSnapshot()
      if (
        folderId &&
        !currentSnapshot.folders.some((folder) => folder.id === folderId)
      ) {
        return
      }

      const nextAssignments = { ...currentSnapshot.assignments }
      nextDocumentIds.forEach((documentId) => {
        if (folderId) {
          nextAssignments[documentId] = folderId
          return
        }
        delete nextAssignments[documentId]
      })

      saveDocumentLibraryFolderSnapshot({
        ...currentSnapshot,
        assignments: nextAssignments,
      })
    },
    [],
  )

  const assignDocumentToFolder = useCallback(
    (documentId: string, folderId: string | null) => {
      assignDocumentsToFolder([documentId], folderId)
    },
    [assignDocumentsToFolder],
  )

  const renameFolder = useCallback(
    (folderId: string, name: string): RenameDocumentLibraryFolderResult => {
      const result = renameDocumentLibraryFolder(
        getDocumentLibraryFolderSnapshot(),
        folderId,
        name,
      )
      if (!result.ok) {
        return result
      }

      return {
        ...result,
        snapshot: saveDocumentLibraryFolderSnapshot(result.snapshot),
      }
    },
    [],
  )

  const deleteFolder = useCallback(
    (folderId: string): DeleteDocumentLibraryFolderResult => {
      const result = deleteDocumentLibraryFolderTree(
        getDocumentLibraryFolderSnapshot(),
        folderId,
      )
      if (!result.ok) {
        return result
      }

      return {
        ...result,
        snapshot: saveDocumentLibraryFolderSnapshot(result.snapshot),
      }
    },
    [],
  )

  const moveFolder = useCallback(
    (folderId: string, parentFolderId: string | null): MoveDocumentLibraryFolderResult => {
      const result = moveDocumentLibraryFolderTree(
        getDocumentLibraryFolderSnapshot(),
        folderId,
        parentFolderId,
      )

      if (!result.ok) {
        return result
      }

      saveDocumentLibraryFolderSnapshot(result.snapshot)
      return result
    },
    [],
  )

  const copyFolder = useCallback(
    (folderId: string, parentFolderId: string | null): CopyDocumentLibraryFolderResult => {
      const result = copyDocumentLibraryFolderTree(
        getDocumentLibraryFolderSnapshot(),
        folderId,
        parentFolderId,
      )

      if (!result.ok) {
        return result
      }

      saveDocumentLibraryFolderSnapshot(result.snapshot)
      return result
    },
    [],
  )

  return {
    folders: snapshot.folders,
    assignments: snapshot.assignments,
    createFolder,
    moveFolder,
    copyFolder,
    renameFolder,
    deleteFolder,
    assignDocumentToFolder,
    assignDocumentsToFolder,
  }
}
