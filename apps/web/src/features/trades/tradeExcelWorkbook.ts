export type TradeExcelSource = {
  trade_id: string
  originating_option_trade_id?: string | null
  external_trade_id: string | null
  source_system: string | null
  execution_timestamp: string | null
  trade_date: string | null
  effective_start_date: string | null
  effective_end_date: string | null
  quality_spec: string | null
  unit_of_measure: string | null
  trade_currency_code: string | null
  location_code: string | null
  delivery_start: string | null
  delivery_end: string | null
  price_unit_code: string | null
  instrument_type: string
  option_type?: string | null
  option_style?: string | null
  option_strike_price?: number | null
  option_expiration_date?: string | null
  trade_nature: string
  trade_structure: string
  trade_side: string | null
  book: string
  portfolio: string | null
  counterparty: string | null
  commodity_class: string
  commodity: string
  pricing_type: string
  pricing_status: string
  confirmation_status: string
  nomination_status: string
  allocation_status: string
  actualization_status: string
  price_index_code: string | null
  price: number | null
  volume: number | null
  invoice_status: string
  payment_status: string
  settlement_status: string
  trader_user: string | null
  status: string
  updated_at: string
  credit_approval_status?: string
  credit_hold_active?: boolean
  credit_hold_reason?: string | null
  active_credit_exception?: {
    expires_at?: string | null
    approved_by?: string | null
    revalidation_required?: boolean
  } | null
  pretrade_review_id?: number | null
  pretrade_recommendation_run_id?: number | null
}

type TradeExcelCellValue = string | number | boolean | null | undefined

export type TradeExcelRow = {
  label: string
  value: TradeExcelCellValue
}

type ZipSourceFile = {
  name: string
  content: string
}

type ZipPreparedFile = {
  name: string
  encodedName: Uint8Array
  data: Uint8Array
  crc: number
  offset: number
}

type BrowserSaveFilePicker = (options?: {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}>

type BrowserWindowWithSavePicker = Window & {
  showSaveFilePicker?: BrowserSaveFilePicker
}

export type TradeWorkbookSaveResult =
  | { status: 'saved'; filename: string }
  | { status: 'downloaded'; filename: string }
  | { status: 'cancelled'; filename: string }
  | { status: 'unavailable'; filename: string }

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const encoder = new TextEncoder()

let crcTable: number[] | null = null

function buildCrcTable(): number[] {
  if (crcTable) {
    return crcTable
  }

  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    return value >>> 0
  })

  return crcTable
}

function crc32(data: Uint8Array): number {
  const table = buildCrcTable()
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function columnAddress(index: number): string {
  let value = index + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

function dosTimestamp(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function localFileHeader(file: ZipPreparedFile, timestamp: { time: number; date: number }): Uint8Array {
  const header = new Uint8Array(30 + file.encodedName.length)
  writeUint32(header, 0, 0x04034b50)
  writeUint16(header, 4, 20)
  writeUint16(header, 6, 0x0800)
  writeUint16(header, 8, 0)
  writeUint16(header, 10, timestamp.time)
  writeUint16(header, 12, timestamp.date)
  writeUint32(header, 14, file.crc)
  writeUint32(header, 18, file.data.length)
  writeUint32(header, 22, file.data.length)
  writeUint16(header, 26, file.encodedName.length)
  writeUint16(header, 28, 0)
  header.set(file.encodedName, 30)
  return header
}

function centralDirectoryHeader(file: ZipPreparedFile, timestamp: { time: number; date: number }): Uint8Array {
  const header = new Uint8Array(46 + file.encodedName.length)
  writeUint32(header, 0, 0x02014b50)
  writeUint16(header, 4, 20)
  writeUint16(header, 6, 20)
  writeUint16(header, 8, 0x0800)
  writeUint16(header, 10, 0)
  writeUint16(header, 12, timestamp.time)
  writeUint16(header, 14, timestamp.date)
  writeUint32(header, 16, file.crc)
  writeUint32(header, 20, file.data.length)
  writeUint32(header, 24, file.data.length)
  writeUint16(header, 28, file.encodedName.length)
  writeUint16(header, 30, 0)
  writeUint16(header, 32, 0)
  writeUint16(header, 34, 0)
  writeUint16(header, 36, 0)
  writeUint32(header, 38, 0)
  writeUint32(header, 42, file.offset)
  header.set(file.encodedName, 46)
  return header
}

function endOfCentralDirectory(fileCount: number, centralDirectoryLength: number, centralDirectoryOffset: number): Uint8Array {
  const record = new Uint8Array(22)
  writeUint32(record, 0, 0x06054b50)
  writeUint16(record, 4, 0)
  writeUint16(record, 6, 0)
  writeUint16(record, 8, fileCount)
  writeUint16(record, 10, fileCount)
  writeUint32(record, 12, centralDirectoryLength)
  writeUint32(record, 16, centralDirectoryOffset)
  writeUint16(record, 20, 0)
  return record
}

function createStoredZip(files: ZipSourceFile[], createdAt: Date): Uint8Array {
  let offset = 0
  const preparedFiles = files.map((file) => {
    const encodedName = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const prepared = {
      name: file.name,
      encodedName,
      data,
      crc: crc32(data),
      offset,
    }
    offset += 30 + encodedName.length + data.length
    return prepared
  })

  const timestamp = dosTimestamp(createdAt)
  const fileChunks = preparedFiles.flatMap((file) => [localFileHeader(file, timestamp), file.data])
  const centralDirectoryOffset = offset
  const centralDirectoryChunks = preparedFiles.map((file) => centralDirectoryHeader(file, timestamp))
  const centralDirectoryLength = centralDirectoryChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  return concatBytes([
    ...fileChunks,
    ...centralDirectoryChunks,
    endOfCentralDirectory(preparedFiles.length, centralDirectoryLength, centralDirectoryOffset),
  ])
}

function cellXml(rowIndex: number, columnIndex: number, value: TradeExcelCellValue, styleId?: number): string {
  const cellRef = `${columnAddress(columnIndex)}${rowIndex}`
  const style = styleId === undefined ? '' : ` s="${styleId}"`
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${cellRef}"${style}><v>${value}</v></c>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${cellRef}" t="b"${style}><v>${value ? '1' : '0'}</v></c>`
  }
  const normalized = value === null || value === undefined ? '' : String(value)
  return `<c r="${cellRef}" t="inlineStr"${style}><is><t>${escapeXml(normalized)}</t></is></c>`
}

function worksheetXml(rows: TradeExcelRow[]): string {
  const xmlRows = [
    ['Field', 'Value'],
    ...rows.map((row) => [row.label, row.value] satisfies [string, TradeExcelCellValue]),
  ]
    .map((row, rowIndex) => {
      const excelRowIndex = rowIndex + 1
      const styleId = rowIndex === 0 ? 1 : undefined
      const cells = row.map((cell, columnIndex) => cellXml(excelRowIndex, columnIndex, cell, styleId)).join('')
      return `<row r="${excelRowIndex}">${cells}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="30" customWidth="1"/>
    <col min="2" max="2" width="42" customWidth="1"/>
  </cols>
  <sheetData>${xmlRows}</sheetData>
</worksheet>`
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Trade Details" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`
}

function corePropertiesXml(createdAt: Date): string {
  const isoTimestamp = createdAt.toISOString()
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>ECTRM Web</dc:creator>
  <cp:lastModifiedBy>ECTRM Web</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoTimestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoTimestamp}</dcterms:modified>
</cp:coreProperties>`
}

function appPropertiesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ECTRM Web</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>Trade Details</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
  <Company>ECTRM</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`
}

export function buildTradeExcelRows(trade: TradeExcelSource): TradeExcelRow[] {
  return [
    { label: 'Trade ID', value: trade.trade_id },
    { label: 'External Trade ID', value: trade.external_trade_id },
    { label: 'Originating Option Trade ID', value: trade.originating_option_trade_id },
    { label: 'Source System', value: trade.source_system },
    { label: 'Status', value: trade.status },
    { label: 'Instrument Type', value: trade.instrument_type },
    { label: 'Option Type', value: trade.option_type },
    { label: 'Option Style', value: trade.option_style },
    { label: 'Option Strike Price', value: trade.option_strike_price },
    { label: 'Option Expiration Date', value: trade.option_expiration_date },
    { label: 'Trade Nature', value: trade.trade_nature },
    { label: 'Trade Structure', value: trade.trade_structure },
    { label: 'Trade Side', value: trade.trade_side },
    { label: 'Book', value: trade.book },
    { label: 'Portfolio', value: trade.portfolio },
    { label: 'Counterparty', value: trade.counterparty },
    { label: 'Commodity Class', value: trade.commodity_class },
    { label: 'Commodity', value: trade.commodity },
    { label: 'Pricing Type', value: trade.pricing_type },
    { label: 'Pricing Status', value: trade.pricing_status },
    { label: 'Price Index Code', value: trade.price_index_code },
    { label: 'Price', value: trade.price },
    { label: 'Volume', value: trade.volume },
    { label: 'Unit Of Measure', value: trade.unit_of_measure },
    { label: 'Trade Currency Code', value: trade.trade_currency_code },
    { label: 'Price Unit Code', value: trade.price_unit_code },
    { label: 'Location Code', value: trade.location_code },
    { label: 'Execution Timestamp', value: trade.execution_timestamp },
    { label: 'Trade Date', value: trade.trade_date },
    { label: 'Effective Start Date', value: trade.effective_start_date },
    { label: 'Effective End Date', value: trade.effective_end_date },
    { label: 'Delivery Start', value: trade.delivery_start },
    { label: 'Delivery End', value: trade.delivery_end },
    { label: 'Quality Spec', value: trade.quality_spec },
    { label: 'Confirmation Status', value: trade.confirmation_status },
    { label: 'Nomination Status', value: trade.nomination_status },
    { label: 'Allocation Status', value: trade.allocation_status },
    { label: 'Actualization Status', value: trade.actualization_status },
    { label: 'Invoice Status', value: trade.invoice_status },
    { label: 'Payment Status', value: trade.payment_status },
    { label: 'Settlement Status', value: trade.settlement_status },
    { label: 'Trader User', value: trade.trader_user },
    { label: 'Credit Approval Status', value: trade.credit_approval_status },
    { label: 'Credit Hold Active', value: trade.credit_hold_active },
    { label: 'Credit Hold Reason', value: trade.credit_hold_reason },
    { label: 'Credit Exception Expires At', value: trade.active_credit_exception?.expires_at },
    { label: 'Credit Exception Approved By', value: trade.active_credit_exception?.approved_by },
    { label: 'Credit Exception Revalidation Required', value: trade.active_credit_exception?.revalidation_required },
    { label: 'Pre-Trade Review ID', value: trade.pretrade_review_id },
    { label: 'Pre-Trade Recommendation Run ID', value: trade.pretrade_recommendation_run_id },
    { label: 'Updated At', value: trade.updated_at },
  ]
}

export function buildTradeWorkbookBlob(trade: TradeExcelSource, createdAt = new Date()): Blob {
  const rows = buildTradeExcelRows(trade)
  const zipBytes = createStoredZip(
    [
      { name: '[Content_Types].xml', content: contentTypesXml() },
      { name: '_rels/.rels', content: rootRelationshipsXml() },
      { name: 'docProps/app.xml', content: appPropertiesXml() },
      { name: 'docProps/core.xml', content: corePropertiesXml(createdAt) },
      { name: 'xl/workbook.xml', content: workbookXml() },
      { name: 'xl/_rels/workbook.xml.rels', content: workbookRelationshipsXml() },
      { name: 'xl/styles.xml', content: stylesXml() },
      { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(rows) },
    ],
    createdAt,
  )
  const workbookBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(workbookBuffer).set(zipBytes)
  return new Blob([workbookBuffer], { type: XLSX_MIME_TYPE })
}

export function suggestedTradeWorkbookFilename(tradeId: string): string {
  const safeTradeId = tradeId.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'trade'
  return `${safeTradeId}-trade-details.xlsx`
}

function triggerDownload(blob: Blob, filename: string): TradeWorkbookSaveResult {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return { status: 'unavailable', filename }
  }

  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
  return { status: 'downloaded', filename }
}

export async function saveTradeWorkbookFromBrowser(trade: TradeExcelSource): Promise<TradeWorkbookSaveResult> {
  const filename = suggestedTradeWorkbookFilename(trade.trade_id)
  const blob = buildTradeWorkbookBlob(trade)

  if (typeof window === 'undefined') {
    return { status: 'unavailable', filename }
  }

  const picker = (window as BrowserWindowWithSavePicker).showSaveFilePicker
  if (!picker) {
    return triggerDownload(blob, filename)
  }

  try {
    const handle = await picker({
      suggestedName: filename,
      types: [
        {
          description: 'Excel workbook',
          accept: {
            [XLSX_MIME_TYPE]: ['.xlsx'],
          },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return { status: 'saved', filename }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { status: 'cancelled', filename }
    }
    throw error
  }
}
