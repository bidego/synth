import { Injectable, NgZone } from '@angular/core';

export type SyncStatus = 'unknown' | 'off' | 'ok' | 'syncing' | 'offline' | 'error';

export interface RemoteItem {
    id: string;
    name: string;
    savedAt: number;
    public?: boolean;
    pid?: string;
}

interface PendingPut {
    kind: 'put';
    name: string;
    savedAt: number;
    data: any;
}

// Absoluto: la app vive en /app/ y la API en /api (relativo iria a /app/api)
const API = '/api';
const KEY_STORAGE = 'synth.syncKey';
const ENABLED_STORAGE = 'synth.syncEnabled';
const DELETED_STORAGE = 'synth.syncDeleted';
const FIRST_RETRY_MS = 3000;
const MAX_RETRY_MS = 60000;
const HEALTH_TIMEOUT_MS = 4000;

/** Un proyecto se identifica en el servidor por su nombre: el mismo nombre es el mismo proyecto. */
export function projectId(name: string): string {
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proyecto';
    // FNV-1a de 32 bits sobre el nombre exacto: dos nombres con el mismo slug no se pisan
    let h = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) {
        h ^= name.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return slug + '-' + ('00000000' + h.toString(16)).slice(-8);
}

function randomKey(): string {
    const bytes = new Uint8Array(32);
    (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
    return Array.from(bytes).map(b => ('0' + b.toString(16)).slice(-2)).join('');
}

/**
 * Sincronizacion de los proyectos guardados con el backend. El navegador se identifica con una clave al azar
 * (guardada solo en este navegador): con la misma clave en otro navegador se ven los mismos proyectos.
 * Si el servidor no esta, todo sigue funcionando en local; lo que no se pudo enviar se reintenta solo.
 */
@Injectable()
export class SyncService {
    public status: SyncStatus = 'unknown';
    public message = '';
    public lastSync = 0;
    public enabled = true;
    public key = '';

    private pending = new Map<string, PendingPut>();   // por id
    private deleted: { [id: string]: number } = {};     // borrados que el servidor todavia no confirmo
    private retryTimer: any;
    private retryMs = FIRST_RETRY_MS;
    private flushing = false;

    constructor(private zone: NgZone) {
        try {
            this.key = localStorage.getItem(KEY_STORAGE) || '';
            this.enabled = localStorage.getItem(ENABLED_STORAGE) !== '0';
            this.deleted = JSON.parse(localStorage.getItem(DELETED_STORAGE)) || {};
        } catch (e) {}
        if (!/^[a-f0-9]{64}$/.test(this.key)) {
            this.key = randomKey();
            this.persist(KEY_STORAGE, this.key);
        }
        window.addEventListener('online', () => this.zone.run(() => this.retryNow()));
    }

    // --- Estado ---

    get active(): boolean {
        return this.enabled && this.status != 'off' && this.status != 'unknown';
    }

    get keyShort(): string {
        return this.key.slice(0, 6) + '...' + this.key.slice(-4);
    }

    get label(): string {
        switch (this.status) {
            case 'ok': return this.lastSync ? 'Sincronizado' : 'Servidor conectado';
            case 'syncing': return 'Enviando...';
            case 'offline': return 'Sin conexion: se enviara cuando vuelva';
            case 'error': return this.message || 'Error al sincronizar';
            case 'off': return 'Sin servidor: los proyectos quedan solo en este navegador';
            default: return 'Buscando el servidor...';
        }
    }

    get unsent(): number {
        return this.pending.size + Object.keys(this.deleted).length;
    }

    setEnabled(on: boolean) {
        this.enabled = on;
        this.persist(ENABLED_STORAGE, on ? '1' : '0');
        if (on)
            this.check();
    }

    /** Usa otra clave (para ver en este navegador los proyectos de otro). */
    setKey(key: string): boolean {
        key = (key || '').trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(key))
            return false;
        this.key = key;
        this.persist(KEY_STORAGE, key);
        this.pending.clear();
        this.deleted = {};
        this.persist(DELETED_STORAGE, '{}');
        return true;
    }

    // --- Comunicacion ---

    private persist(key: string, value: string) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {}
    }

    private headers(json = false): { [k: string]: string } {
        const h: { [k: string]: string } = { Authorization: 'Bearer ' + this.key };
        if (json)
            h['Content-Type'] = 'application/json';
        return h;
    }

    private async request(method: string, path: string, body?: any): Promise<Response> {
        const res = await fetch(API + path, {
            method, headers: this.headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined,
            cache: 'no-store'
        });
        return res;
    }

    /** Ver si hay servidor. Si no lo hay, la app sigue andando solo con el navegador. */
    async check(): Promise<boolean> {
        if (!this.enabled) {
            this.set('off', '');
            return false;
        }
        try {
            const ctl = typeof AbortController != 'undefined' ? new AbortController() : null;
            const timer = setTimeout(() => ctl && ctl.abort(), HEALTH_TIMEOUT_MS);
            const res = await fetch(API + '/health', { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
            clearTimeout(timer);
            let ok = res.ok && /json/.test(res.headers.get('content-type') || '');
            // nginx contesta {"backend":false} cuando el servidor no esta
            let broken = false;
            if (ok) {
                const health = await res.json();
                ok = health.backend !== false;
                // El servidor esta pero no pudo preparar su repositorio git (URL o token mal configurados)
                broken = ok && health.ready === false;
            }
            if (broken) {
                this.set('error', 'El servidor no puede acceder a su repositorio git (revisar GIT_REPO_URL y GIT_TOKEN; detalle en /api/health)');
                return false;
            }
            this.set(ok ? 'ok' : 'off', '');
            return ok;
        } catch (e) {
            this.set('off', '');
            return false;
        }
    }

    private set(status: SyncStatus, message: string) {
        this.zone.run(() => {
            this.status = status;
            this.message = message;
        });
    }

    // --- Enviar ---

    /** Encola un proyecto para enviarlo. Si ya habia uno del mismo nombre pendiente, queda el mas nuevo. */
    push(name: string, savedAt: number, data: any) {
        if (!this.enabled || this.status == 'off')
            return;
        const id = projectId(name);
        delete this.deleted[id];
        this.persist(DELETED_STORAGE, JSON.stringify(this.deleted));
        this.pending.set(id, { kind: 'put', name, savedAt, data });
        this.flush();
    }

    remove(name: string) {
        if (!this.enabled || this.status == 'off')
            return;
        const id = projectId(name);
        this.pending.delete(id);
        this.deleted[id] = Date.now();
        this.persist(DELETED_STORAGE, JSON.stringify(this.deleted));
        this.flush();
    }

    isDeleted(name: string): boolean {
        return projectId(name) in this.deleted;
    }

    retryNow() {
        clearTimeout(this.retryTimer);
        this.retryMs = FIRST_RETRY_MS;
        if (this.unsent)
            this.flush();
    }

    private scheduleRetry() {
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.flush(), this.retryMs);
        this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs * 2);
    }

    /** Manda lo pendiente de a uno. Un error de red deja todo en la cola y reintenta con espera creciente. */
    async flush() {
        if (this.flushing || !this.unsent)
            return;
        this.flushing = true;
        this.set('syncing', '');
        try {
            for (const id of Object.keys(this.deleted)) {
                const res = await this.request('DELETE', '/projects/' + id);
                if (res.status == 401)
                    throw AuthError();
                if (res.status >= 500 || res.status == 429)
                    throw NetworkError();
                delete this.deleted[id];
                this.persist(DELETED_STORAGE, JSON.stringify(this.deleted));
            }
            for (const [id, op] of Array.from(this.pending.entries())) {
                const res = await this.request('PUT', '/projects/' + id, { name: op.name, savedAt: op.savedAt, data: op.data });
                if (res.status == 401)
                    throw AuthError();
                if (res.status == 503)
                    throw Failure('El servidor no puede guardar todavia (problema con su repositorio git)');
                if (res.status >= 500 || res.status == 429)
                    throw NetworkError();
                if (res.status == 413) {
                    this.pending.delete(id);
                    throw Failure('"' + op.name + '" es demasiado grande para el servidor');
                }
                // 409: el servidor tiene algo mas nuevo (otro dispositivo): se deja; la proxima sincronizacion lo trae
                this.pending.delete(id);
            }
            this.lastSync = Date.now();
            this.retryMs = FIRST_RETRY_MS;
            this.set('ok', '');
        } catch (e) {
            if (e && e.kind == 'auth')
                this.set('error', 'El servidor no acepto la clave de sincronizacion');
            else if (e && e.kind == 'failure')
                this.set('error', e.message);
            else {
                this.set('offline', '');
                this.scheduleRetry();
            }
        } finally {
            this.flushing = false;
        }
    }

    // --- Traer ---

    /** Lista de proyectos del servidor para esta clave (null si no se pudo). */
    async list(): Promise<Array<RemoteItem> | null> {
        if (!this.enabled || this.status == 'off')
            return null;
        try {
            const res = await this.request('GET', '/projects');
            if (res.status == 401) {
                this.set('error', 'El servidor no acepto la clave de sincronizacion');
                return null;
            }
            if (!res.ok)
                throw NetworkError();
            const items = await res.json();
            return Array.isArray(items) ? items : null;
        } catch (e) {
            this.set('offline', '');
            this.scheduleRetry();
            return null;
        }
    }

    /** Un proyecto completo del servidor: { name, savedAt, data } (null si no se pudo). */
    async get(id: string): Promise<{ name: string; savedAt: number; data: any } | null> {
        try {
            const res = await this.request('GET', '/projects/' + id);
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    /** El servidor esta disponible para compartir y publicar (hay conexion y la clave es aceptada). */
    get online(): boolean {
        return this.enabled && (this.status == 'ok' || this.status == 'syncing');
    }

    /** Sube una copia de la sesion y devuelve su codigo corto (null si no se pudo). Cualquiera con el codigo la abre. */
    async createShare(name: string, data: any): Promise<string | null> {
        if (!this.online)
            return null;
        try {
            const res = await this.request('POST', '/shares', { name, savedAt: Date.now(), data });
            if (!res.ok)
                return null;
            const j = await res.json();
            return j && /^[0-9A-Za-z]{10}$/.test(j.code) ? j.code : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Envia un proyecto ahora (sin cola) con datos de publicacion. Devuelve { pid } si quedo publico, {} si es privado,
     * o { error } con el motivo.
     */
    async putNow(name: string, savedAt: number, data: any, extra: { public?: boolean; author?: string; description?: string }): Promise<{ pid?: string; error?: string }> {
        if (!this.online)
            return { error: 'No hay conexion con el servidor' };
        try {
            const res = await this.request('PUT', '/projects/' + projectId(name), Object.assign({ name, savedAt, data }, extra));
            const j = await res.json().catch(() => ({}));
            if (res.ok)
                return { pid: j.pid };
            return { error: j && j.error || 'El servidor no pudo guardarlo (' + res.status + ')' };
        } catch (e) {
            return { error: 'No hay conexion con el servidor' };
        }
    }

    markSynced() {
        this.lastSync = Date.now();
        if (this.status != 'error')
            this.set('ok', '');
    }
}

// Errores de la cola (objetos simples: `class X extends Error` no funciona con `instanceof` en el bundle ES5)
interface SyncFault { kind: 'network' | 'auth' | 'failure'; message?: string; }
const NetworkError = (): SyncFault => ({ kind: 'network' });
const AuthError = (): SyncFault => ({ kind: 'auth' });
const Failure = (message: string): SyncFault => ({ kind: 'failure', message });
