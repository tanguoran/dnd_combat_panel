import type { SceneState } from '../model/types'

const DB_NAME = 'live-battle-board'
const DB_VERSION = 1
const CURRENT_SCENE = 'current'

interface AssetRecord {
  id: string
  name: string
  type: string
  blob: Blob
}

export interface ExportedAsset {
  id: string
  name: string
  type: string
  data: string
}

const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export class BattleBoardDatabase {
  private readonly dbPromise: Promise<IDBDatabase>

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('scenes')) db.createObjectStore('scenes')
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async loadScene(): Promise<SceneState | undefined> {
    const db = await this.dbPromise
    return requestValue(db.transaction('scenes').objectStore('scenes').get(CURRENT_SCENE))
  }

  async saveScene(scene: SceneState): Promise<void> {
    const db = await this.dbPromise
    const transaction = db.transaction('scenes', 'readwrite')
    transaction.objectStore('scenes').put(structuredClone(scene), CURRENT_SCENE)
    await transactionDone(transaction)
  }

  async saveAsset(id: string, name: string, blob: Blob): Promise<void> {
    const db = await this.dbPromise
    const transaction = db.transaction('assets', 'readwrite')
    transaction.objectStore('assets').put({ id, name, type: blob.type, blob } satisfies AssetRecord)
    await transactionDone(transaction)
  }

  async getAssetBlob(id: string): Promise<Blob | undefined> {
    const db = await this.dbPromise
    const record = await requestValue<AssetRecord | undefined>(db.transaction('assets').objectStore('assets').get(id))
    return record?.blob
  }

  async exportAssets(ids: string[]): Promise<ExportedAsset[]> {
    const db = await this.dbPromise
    const store = db.transaction('assets').objectStore('assets')
    const records = await Promise.all(ids.map((id) => requestValue<AssetRecord | undefined>(store.get(id))))
    return Promise.all(
      records.filter((record): record is AssetRecord => Boolean(record)).map(async (record) => ({
        id: record.id,
        name: record.name,
        type: record.type,
        data: await blobToDataUrl(record.blob),
      })),
    )
  }

  async importAssets(assets: ExportedAsset[]): Promise<void> {
    for (const asset of assets) {
      const blob = await fetch(asset.data).then((response) => response.blob())
      await this.saveAsset(asset.id, asset.name, blob)
    }
  }
}
