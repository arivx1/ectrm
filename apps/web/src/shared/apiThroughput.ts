export type ApiThroughputSnapshot = {
  bytesInPerSecond: number
  bytesOutPerSecond: number
  sampleWindowMs: number
  lastTransferAt: number | null
}

type ApiThroughputSample = {
  recordedAt: number
  bytesIn: number
  bytesOut: number
}

const API_THROUGHPUT_WINDOW_MS = 15_000

const textEncoder = new TextEncoder()
const samples: ApiThroughputSample[] = []
const listeners = new Set<() => void>()

let currentSnapshot: ApiThroughputSnapshot = {
  bytesInPerSecond: 0,
  bytesOutPerSecond: 0,
  sampleWindowMs: API_THROUGHPUT_WINDOW_MS,
  lastTransferAt: null,
}

export function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength
}

function bodyByteLength(body: BodyInit | null | undefined): number {
  if (!body) {
    return 0
  }

  if (typeof body === 'string') {
    return byteLength(body)
  }

  if (body instanceof URLSearchParams) {
    return byteLength(body.toString())
  }

  if (body instanceof Blob) {
    return body.size
  }

  if (body instanceof FormData) {
    let totalBytes = 0
    body.forEach((value, key) => {
      totalBytes += byteLength(key)
      totalBytes += typeof value === 'string' ? byteLength(value) : value.size
    })
    return totalBytes
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength
  }

  if (ArrayBuffer.isView(body)) {
    return body.byteLength
  }

  return 0
}

function headersByteLength(headers: HeadersInit | undefined): number {
  if (!headers) {
    return 0
  }

  let totalBytes = 0
  new Headers(headers).forEach((value, key) => {
    totalBytes += byteLength(key) + byteLength(value)
  })
  return totalBytes
}

export function estimateApiRequestBytes(url: string, init?: RequestInit): number {
  const method = init?.method ?? 'GET'
  return byteLength(method) + byteLength(url) + headersByteLength(init?.headers) + bodyByteLength(init?.body)
}

function pruneSamples(now: number): void {
  while (samples.length > 0 && now - samples[0].recordedAt > API_THROUGHPUT_WINDOW_MS) {
    samples.shift()
  }
}

function rebuildSnapshot(now: number): ApiThroughputSnapshot {
  pruneSamples(now)
  const total = samples.reduce(
    (accumulator, sample) => ({
      bytesIn: accumulator.bytesIn + sample.bytesIn,
      bytesOut: accumulator.bytesOut + sample.bytesOut,
      lastTransferAt:
        accumulator.lastTransferAt === null
          ? sample.recordedAt
          : Math.max(accumulator.lastTransferAt, sample.recordedAt),
    }),
    { bytesIn: 0, bytesOut: 0, lastTransferAt: null as number | null },
  )

  if (samples.length === 0) {
    return {
      bytesInPerSecond: 0,
      bytesOutPerSecond: 0,
      sampleWindowMs: API_THROUGHPUT_WINDOW_MS,
      lastTransferAt: null,
    }
  }

  const firstSampleAt = samples[0].recordedAt
  const sampleDurationSeconds = Math.max(1, Math.min(API_THROUGHPUT_WINDOW_MS, now - firstSampleAt) / 1000)
  return {
    bytesInPerSecond: total.bytesIn / sampleDurationSeconds,
    bytesOutPerSecond: total.bytesOut / sampleDurationSeconds,
    sampleWindowMs: API_THROUGHPUT_WINDOW_MS,
    lastTransferAt: total.lastTransferAt,
  }
}

function snapshotsEqual(left: ApiThroughputSnapshot, right: ApiThroughputSnapshot): boolean {
  return (
    left.bytesInPerSecond === right.bytesInPerSecond &&
    left.bytesOutPerSecond === right.bytesOutPerSecond &&
    left.lastTransferAt === right.lastTransferAt
  )
}

function updateSnapshot(now = Date.now()): void {
  const nextSnapshot = rebuildSnapshot(now)
  if (snapshotsEqual(currentSnapshot, nextSnapshot)) {
    return
  }

  currentSnapshot = nextSnapshot
  listeners.forEach((listener) => listener())
}

export function recordApiTransfer({
  bytesIn = 0,
  bytesOut = 0,
  recordedAt = Date.now(),
}: {
  bytesIn?: number
  bytesOut?: number
  recordedAt?: number
}): void {
  if (bytesIn <= 0 && bytesOut <= 0) {
    return
  }

  samples.push({
    recordedAt,
    bytesIn: Math.max(0, bytesIn),
    bytesOut: Math.max(0, bytesOut),
  })
  updateSnapshot(recordedAt)
}

export function refreshApiThroughputSnapshot(): void {
  updateSnapshot()
}

export function getApiThroughputSnapshot(): ApiThroughputSnapshot {
  return currentSnapshot
}

export function subscribeApiThroughput(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
