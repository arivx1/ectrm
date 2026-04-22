import type {
  BookForm,
  CounterpartyCreditProfileForm,
  CounterpartyCreditProfileRecord,
  CounterpartyStandards,
  ReferenceRecord,
} from '../../shared/models'

export function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? '').trim() === (right ?? '').trim()
}

export type BookPasteIssue = {
  row_number: number
  code: string | null
  message: string
}

export type BookPasteSummary = {
  total_rows: number
  staged_rows: number
  new_rows: number
  updated_rows: number
  invalid_rows: number
  unchanged_rows: number
  blocked_rows: number
  issues: BookPasteIssue[]
  used_header: boolean
  delimiter: 'tab' | 'comma'
}

export function buildBookForm(record: ReferenceRecord): BookForm {
  return {
    code: record.code,
    name: record.name,
    description: record.description ?? '',
  }
}

export function emptyCounterpartyCreditProfileForm(
  counterpartyStandards: CounterpartyStandards,
): CounterpartyCreditProfileForm {
  return {
    credit_rating: '',
    review_due_at: '',
    limit_currency_code: '',
    limit_amount: '',
    breach_action: counterpartyStandards.default_counterparty_credit_breach_action,
    notes: '',
  }
}

export function buildCounterpartyCreditProfileForm(
  profile: CounterpartyCreditProfileRecord | null,
  counterpartyStandards: CounterpartyStandards,
): CounterpartyCreditProfileForm {
  if (!profile) {
    return emptyCounterpartyCreditProfileForm(counterpartyStandards)
  }

  return {
    credit_rating: profile.credit_rating ?? '',
    review_due_at: profile.review_due_at ?? '',
    limit_currency_code: profile.limit_currency_code ?? '',
    limit_amount: profile.limit_amount != null ? String(profile.limit_amount) : '',
    breach_action: profile.breach_action ?? counterpartyStandards.default_counterparty_credit_breach_action,
    notes: profile.notes ?? '',
  }
}

function normalizePasteHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function parseDelimitedLine(line: string, delimiter: '\t' | ','): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === delimiter && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += character
  }

  values.push(current)
  return values
}

export function parsePastedGrid(input: string): { rows: string[][]; delimiter: 'tab' | 'comma' } {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  const delimiter: '\t' | ',' = lines.some((line) => line.includes('\t')) ? '\t' : ','
  return {
    rows: lines.map((line) => parseDelimitedLine(line, delimiter)),
    delimiter: delimiter === '\t' ? 'tab' : 'comma',
  }
}

export function resolveBookPasteMapping(rows: string[][]):
  | { codeIndex: number; nameIndex: number; descriptionIndex: number; startIndex: number; usedHeader: boolean }
  | { error: string } {
  if (rows.length === 0) {
    return { error: 'Paste at least one row containing Code and Name.' }
  }

  const firstRowHeaders = rows[0].map(normalizePasteHeader)
  const codeHeaderIndex = firstRowHeaders.findIndex((value) => value === 'code' || value === 'bookcode' || value === 'book')
  const nameHeaderIndex = firstRowHeaders.findIndex((value) => value === 'name' || value === 'bookname')
  const descriptionHeaderIndex = firstRowHeaders.findIndex(
    (value) => value === 'description' || value === 'desc' || value === 'details' || value === 'notes',
  )

  const usedHeader = codeHeaderIndex >= 0 || nameHeaderIndex >= 0 || descriptionHeaderIndex >= 0
  if (usedHeader) {
    if (codeHeaderIndex < 0 || nameHeaderIndex < 0) {
      return { error: 'Header rows must include Code and Name columns. Description is optional.' }
    }

    return {
      codeIndex: codeHeaderIndex,
      nameIndex: nameHeaderIndex,
      descriptionIndex: descriptionHeaderIndex,
      startIndex: 1,
      usedHeader: true,
    }
  }

  if ((rows[0]?.length ?? 0) < 2) {
    return { error: 'Paste Code and Name columns, with optional Description as the third column.' }
  }

  return {
    codeIndex: 0,
    nameIndex: 1,
    descriptionIndex: 2,
    startIndex: 0,
    usedHeader: false,
  }
}

export function validateBookSheetForm(candidate: BookForm): string {
  if (!candidate.code.trim()) {
    return 'Code is required.'
  }

  if (!candidate.name.trim()) {
    return 'Name is required.'
  }

  return ''
}

type StageBooksFromPasteArgs = {
  input: string
  books: ReferenceRecord[]
  existingDrafts: Record<string, BookForm>
  existingApplyErrors: Record<string, string>
}

type StageBooksFromPasteResult = {
  nextDrafts: Record<string, BookForm>
  nextApplyErrors: Record<string, string>
  summary: BookPasteSummary | null
  successMessage: string
  errorMessage: string
}

export function stageBooksFromPasteInput({
  input,
  books,
  existingDrafts,
  existingApplyErrors,
}: StageBooksFromPasteArgs): StageBooksFromPasteResult {
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return {
      nextDrafts: existingDrafts,
      nextApplyErrors: existingApplyErrors,
      summary: null,
      successMessage: '',
      errorMessage: 'Paste Code and Name rows first, then stage them into the books grid.',
    }
  }

  const { rows, delimiter } = parsePastedGrid(trimmedInput)
  const mapping = resolveBookPasteMapping(rows)
  if ('error' in mapping) {
    return {
      nextDrafts: existingDrafts,
      nextApplyErrors: existingApplyErrors,
      summary: null,
      successMessage: '',
      errorMessage: mapping.error,
    }
  }

  const nextDrafts = { ...existingDrafts }
  const nextApplyErrors = { ...existingApplyErrors }
  const issues: BookPasteIssue[] = []
  let stagedRows = 0
  let newRows = 0
  let updatedRows = 0
  let invalidRows = 0
  let unchangedRows = 0
  let blockedRows = 0

  for (let rowIndex = mapping.startIndex; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex]
    const displayRowNumber = rowIndex + 1
    const rawCode = (cells[mapping.codeIndex] ?? '').trim()
    const rawName = (cells[mapping.nameIndex] ?? '').trim()
    const rawDescription =
      mapping.descriptionIndex >= 0 ? (cells[mapping.descriptionIndex] ?? '').trim() : null

    if (!rawCode) {
      issues.push({ row_number: displayRowNumber, code: null, message: 'Missing Code.' })
      blockedRows += 1
      continue
    }

    const code = rawCode.toUpperCase()
    const record = books.find((book) => book.code === code)
    const nextDraft = {
      code,
      name: rawName,
      description: rawDescription ?? (nextDrafts[code]?.description ?? record?.description ?? ''),
    }

    const hasChanges =
      !record ||
      !sameText(nextDraft.name, record.name) ||
      !sameText(nextDraft.description, record.description)
    if (!hasChanges) {
      delete nextDrafts[code]
      delete nextApplyErrors[code]
      unchangedRows += 1
      continue
    }

    nextDrafts[code] = nextDraft
    if (record) {
      updatedRows += 1
    } else {
      newRows += 1
    }
    const validationError = validateBookSheetForm(nextDraft)
    if (validationError) {
      nextApplyErrors[code] = validationError
      invalidRows += 1
    } else {
      delete nextApplyErrors[code]
    }

    stagedRows += 1
  }

  const summary: BookPasteSummary = {
    total_rows: rows.length - mapping.startIndex,
    staged_rows: stagedRows,
    new_rows: newRows,
    updated_rows: updatedRows,
    invalid_rows: invalidRows,
    unchanged_rows: unchangedRows,
    blocked_rows: blockedRows,
    issues,
    used_header: mapping.usedHeader,
    delimiter,
  }

  if (stagedRows > 0) {
    return {
      nextDrafts,
      nextApplyErrors,
      summary,
      successMessage: `Staged ${stagedRows} pasted book row${stagedRows === 1 ? '' : 's'}.`,
      errorMessage:
        blockedRows > 0 || invalidRows > 0
          ? `${blockedRows + invalidRows} pasted row${blockedRows + invalidRows === 1 ? '' : 's'} need attention before apply.`
          : '',
    }
  }

  if (unchangedRows > 0 && blockedRows === 0) {
    return {
      nextDrafts,
      nextApplyErrors,
      summary,
      successMessage: `Paste matched ${unchangedRows} existing book row${unchangedRows === 1 ? '' : 's'} but added no new staged changes.`,
      errorMessage: '',
    }
  }

  return {
    nextDrafts,
    nextApplyErrors,
    summary,
    successMessage: '',
    errorMessage: 'No pasted rows were staged. Review the import summary and adjust the pasted data.',
  }
}
