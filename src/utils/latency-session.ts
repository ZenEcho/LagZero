import type { LatencyRecord } from '@/types'

const DB_NAME = 'lagzero-latency-session'
const DB_VERSION = 2
const STORE_NAME = 'latency_records'

let dbPromise: Promise<IDBDatabase> | null = null
let initialized = false

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      let store: IDBObjectStore
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      } else {
        const tx = request.transaction
        if (!tx) return
        store = tx.objectStore(STORE_NAME)
      }

      if (!store.indexNames.contains('nodeKey')) {
        store.createIndex('nodeKey', 'nodeKey', { unique: false })
      }
      if (!store.indexNames.contains('timestamp')) {
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!store.indexNames.contains('nodeKey_timestamp')) {
        store.createIndex('nodeKey_timestamp', ['nodeKey', 'timestamp'], { unique: false })
      }
      if (!store.indexNames.contains('gameId_timestamp')) {
        store.createIndex('gameId_timestamp', ['gameId', 'timestamp'], { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open latency session DB'))
  })

  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function initLatencySessionStore() {
  const db = await openDb()
  if (initialized) return

  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).clear()
  await txDone(tx)
  initialized = true
}

export async function appendLatencyRecord(record: LatencyRecord) {
  const db = await openDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).add(record)
  await txDone(tx)
}

export async function getRecentLatencyRecords(nodeKey: string, limit = 240): Promise<LatencyRecord[]> {
  if (!nodeKey || limit <= 0) return []

  const db = await openDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const index = tx.objectStore(STORE_NAME).index('nodeKey_timestamp')
  const range = IDBKeyRange.bound([nodeKey, 0], [nodeKey, Number.MAX_SAFE_INTEGER])

  return new Promise((resolve, reject) => {
    const records: LatencyRecord[] = []
    const req = index.openCursor(range, 'prev')

    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor || records.length >= limit) {
        resolve(records.reverse())
        return
      }
      records.push(cursor.value as LatencyRecord)
      cursor.continue()
    }
    req.onerror = () => reject(req.error ?? new Error('Failed to read latency records'))
  })
}

export async function getGameLatencyStats(gameId: string): Promise<{ total: number; lost: number }> {
  if (!gameId) return { total: 0, lost: 0 }

  const db = await openDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const index = tx.objectStore(STORE_NAME).index('gameId_timestamp')
  const range = IDBKeyRange.bound([gameId, 0], [gameId, Number.MAX_SAFE_INTEGER])

  return new Promise((resolve, reject) => {
    let total = 0
    let lost = 0
    const req = index.openCursor(range, 'next')

    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve({ total, lost })
        return
      }
      const row = cursor.value as LatencyRecord
      total += 1
      if (row.loss > 0 || row.latency <= 0) {
        lost += 1
      }
      cursor.continue()
    }
    req.onerror = () => reject(req.error ?? new Error('Failed to read game latency stats'))
  })
}
