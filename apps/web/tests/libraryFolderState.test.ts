import assert from 'node:assert/strict'

import { afterEach, test } from 'vitest'

import {
  copyDocumentLibraryFolderTree,
  getDocumentLibraryFolderSnapshot,
  moveDocumentLibraryFolderTree,
} from '../src/workspaces/library/libraryFolderState'

type LocalStorageMock = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const originalWindow = globalThis.window

function installWindowWithStorage(initialEntries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialEntries))
  const localStorage: LocalStorageMock = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value)
    },
    removeItem: (key) => {
      storage.delete(key)
    },
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  })
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
})

test('returns a stable folder snapshot reference when storage has not changed', () => {
  installWindowWithStorage({
    'ectrm.document-library-folders': JSON.stringify({
      folders: [
        {
          id: 'credit-docs',
          name: 'Credit Docs',
          createdAt: '2026-05-15T10:00:00Z',
          parentFolderId: null,
        },
      ],
      assignments: {
        'DOC-1': 'credit-docs',
      },
    }),
  })

  const firstSnapshot = getDocumentLibraryFolderSnapshot()
  const secondSnapshot = getDocumentLibraryFolderSnapshot()

  assert.equal(firstSnapshot, secondSnapshot)
  assert.deepEqual(firstSnapshot, {
    folders: [
      {
        id: 'credit-docs',
        name: 'Credit Docs',
        createdAt: '2026-05-15T10:00:00Z',
        parentFolderId: null,
      },
    ],
    assignments: {
      'DOC-1': 'credit-docs',
    },
  })
})

test('moves a folder into a different parent without disturbing nested structure or assignments', () => {
  const snapshot = {
    folders: [
      {
        id: 'credit-docs',
        name: 'Credit Docs',
        createdAt: '2026-05-15T10:00:00Z',
        parentFolderId: null,
      },
      {
        id: 'letters-of-credit',
        name: 'Letters Of Credit',
        createdAt: '2026-05-15T10:05:00Z',
        parentFolderId: 'credit-docs',
      },
      {
        id: 'archive',
        name: 'Archive',
        createdAt: '2026-05-15T10:10:00Z',
        parentFolderId: null,
      },
    ],
    assignments: {
      'DOC-1': 'credit-docs',
      'DOC-2': 'letters-of-credit',
    },
  }

  const result = moveDocumentLibraryFolderTree(snapshot, 'credit-docs', 'archive')

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.deepEqual(result.snapshot.assignments, snapshot.assignments)
  assert.deepEqual(result.snapshot.folders, [
    {
      id: 'credit-docs',
      name: 'Credit Docs',
      createdAt: '2026-05-15T10:00:00Z',
      parentFolderId: 'archive',
    },
    {
      id: 'letters-of-credit',
      name: 'Letters Of Credit',
      createdAt: '2026-05-15T10:05:00Z',
      parentFolderId: 'credit-docs',
    },
    {
      id: 'archive',
      name: 'Archive',
      createdAt: '2026-05-15T10:10:00Z',
      parentFolderId: null,
    },
  ])
})

test('prevents moving a folder into one of its own descendants', () => {
  const result = moveDocumentLibraryFolderTree(
    {
      folders: [
        {
          id: 'credit-docs',
          name: 'Credit Docs',
          createdAt: '2026-05-15T10:00:00Z',
          parentFolderId: null,
        },
        {
          id: 'letters-of-credit',
          name: 'Letters Of Credit',
          createdAt: '2026-05-15T10:05:00Z',
          parentFolderId: 'credit-docs',
        },
      ],
      assignments: {
        'DOC-2': 'letters-of-credit',
      },
    },
    'credit-docs',
    'letters-of-credit',
  )

  assert.deepEqual(result, {
    ok: false,
    error: 'A folder cannot be moved into one of its own subfolders.',
  })
})

test('copies a folder subtree with a unique root name and leaves file assignments in place', () => {
  let nextFolderId = 1
  const snapshot = {
    folders: [
      {
        id: 'credit-docs',
        name: 'Credit Docs',
        createdAt: '2026-05-15T10:00:00Z',
        parentFolderId: null,
      },
      {
        id: 'letters-of-credit',
        name: 'Letters Of Credit',
        createdAt: '2026-05-15T10:05:00Z',
        parentFolderId: 'credit-docs',
      },
      {
        id: 'credit-docs-copy',
        name: 'Credit Docs Copy',
        createdAt: '2026-05-15T10:10:00Z',
        parentFolderId: null,
      },
    ],
    assignments: {
      'DOC-1': 'credit-docs',
      'DOC-2': 'letters-of-credit',
    },
  }

  const result = copyDocumentLibraryFolderTree(snapshot, 'credit-docs', null, {
    createdAt: '2026-05-15T12:00:00Z',
    idFactory: () => `copy-${nextFolderId++}`,
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  assert.equal(result.folder.name, 'Credit Docs Copy 2')
  assert.equal(result.createdFolderCount, 2)
  assert.deepEqual(result.snapshot.assignments, snapshot.assignments)
  assert.deepEqual(result.snapshot.folders.slice(-2), [
    {
      id: 'copy-1',
      name: 'Credit Docs Copy 2',
      createdAt: '2026-05-15T12:00:00Z',
      parentFolderId: null,
    },
    {
      id: 'copy-2',
      name: 'Letters Of Credit',
      createdAt: '2026-05-15T12:00:00Z',
      parentFolderId: 'copy-1',
    },
  ])
})
