import type { EditorDocument } from './model'

const DB = 'forma-projects'
const STORE = 'documents'
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    action(tx.objectStore(STORE), resolve, reject)
    tx.oncomplete = () => db.close()
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
export const saveDocument = (doc: EditorDocument) => transaction<void>('readwrite', (store, resolve, reject) => {
  const req = store.put(doc); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error)
})
export const getDocuments = () => transaction<EditorDocument[]>('readonly', (store, resolve, reject) => {
  const req = store.getAll(); req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt)); req.onerror = () => reject(req.error)
})
export const deleteDocument = (id: string) => transaction<void>('readwrite', (store, resolve, reject) => {
  const req = store.delete(id); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error)
})
