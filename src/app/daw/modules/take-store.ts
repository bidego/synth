/** Una toma de audio guardada: el audio de cada canal, aparte del proyecto (que solo lleva sus metadatos). */
export interface StoredTake {
    id: string;
    rate: number;
    channels: Array<Float32Array>;
}

const DB_NAME = 'syntotec-recorder';
const STORE = 'takes';

/**
 * Las tomas del grabador en IndexedDB del navegador, por id de toma. Todo va con try/catch: si IndexedDB no existe, esta bloqueado
 * (ventana privada) o falla, el grabador sigue andando, solo que las tomas no sobreviven a recargar la pagina.
 * Cada metodo devuelve una promesa que nunca se rechaza.
 */
export class TakeStore {
    private db: Promise<IDBDatabase | null> | null = null;
    /** false cuando IndexedDB no esta disponible (se avisa en el panel). */
    public available = true;

    private open(): Promise<IDBDatabase | null> {
        if (!this.db) {
            this.db = new Promise<IDBDatabase | null>(resolve => {
                try {
                    const idb: IDBFactory = (window as any).indexedDB;
                    if (!idb)
                        throw new Error('sin indexedDB');
                    const req = idb.open(DB_NAME, 1);
                    req.onupgradeneeded = () => {
                        try {
                            if (!req.result.objectStoreNames.contains(STORE))
                                req.result.createObjectStore(STORE, { keyPath: 'id' });
                        } catch (e) {}
                    };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => { this.available = false; resolve(null); };
                    req.onblocked = () => { this.available = false; resolve(null); };
                } catch (e) {
                    this.available = false;
                    resolve(null);
                }
            });
        }
        return this.db;
    }

    private request<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
        return this.open().then(db => new Promise<T | null>(resolve => {
            if (!db)
                return resolve(null);
            try {
                const tx = db.transaction(STORE, mode);
                const req = fn(tx.objectStore(STORE));
                let result: any = null;
                req.onsuccess = () => result = req.result;
                tx.oncomplete = () => resolve(result === undefined ? null : result);
                tx.onerror = tx.onabort = () => { this.available = false; resolve(null); };
            } catch (e) {
                this.available = false;
                resolve(null);
            }
        }));
    }

    /** Guarda una toma. Devuelve false si no se pudo (la toma queda solo en memoria). */
    put(take: StoredTake): Promise<boolean> {
        return this.request<any>('readwrite', s => s.put({ id: take.id, rate: take.rate, channels: take.channels }))
            .then(r => r !== null);
    }

    /** Lee una toma, o null si no esta en este navegador. */
    get(id: string): Promise<StoredTake | null> {
        return this.request<any>('readonly', s => s.get(id)).then(r =>
            r && typeof r.rate == 'number' && Array.isArray(r.channels) && r.channels.length
                && r.channels.every((c: any) => c instanceof Float32Array) ? r as StoredTake : null);
    }

    delete(id: string): Promise<void> {
        return this.request<any>('readwrite', s => s.delete(id)).then(() => undefined);
    }
}

export const TAKE_STORE = new TakeStore();
