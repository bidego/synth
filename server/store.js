'use strict';
// Los proyectos viven en memoria; cada cambio se escribe a disco enseguida y se versiona en git en tandas
// (un commit cada pocos segundos con todo lo que cambio, y push). El repositorio es la base de datos:
// al arrancar se trae del remoto y se carga todo en memoria.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { summarize, previewOf, clean } = require('./publicdata');

const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const KEY_RE = /^[a-f0-9]{32,128}$/;
const CODE_RE = /^[0-9A-Za-z]{10}$/;
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** El dueño en el repositorio es un hash de su clave: quien lea el repo no puede deducir la clave. */
function ownerOf(key) {
    return crypto.createHash('sha256').update('syntotec-owner:' + key).digest('hex').slice(0, 32);
}

class HttpError extends Error {
    constructor(status, message, extra) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

function validateProject(body) {
    if (!body || typeof body != 'object' || Array.isArray(body))
        throw new HttpError(400, 'El cuerpo debe ser un objeto JSON');
    const name = typeof body.name == 'string' ? clean(body.name, 40) : '';
    if (!name)
        throw new HttpError(400, 'Falta el nombre del proyecto');
    const data = body.data;
    const isV2 = data && typeof data == 'object' && data.rack && typeof data.rack == 'object' && Array.isArray(data.rack.modules);
    const isV1 = data && typeof data == 'object' && Array.isArray(data.tracks);
    if (!isV2 && !isV1)
        throw new HttpError(400, 'Los datos no parecen un proyecto de Syntotec');
    const savedAt = typeof body.savedAt == 'number' && isFinite(body.savedAt) ? Math.round(body.savedAt) : Date.now();
    // Publicacion: `public` ausente = no tocar lo que ya hay; true = publicar; false = dejar de publicar
    const out = { name, savedAt, data };
    if (typeof body.public == 'boolean')
        out.public = body.public;
    if (body.author !== undefined)
        out.author = clean(body.author, 30);
    if (body.description !== undefined)
        out.description = clean(body.description, 240);
    return out;
}

class Store {
    /**
     * @param {Git} git
     * @param {object} opts { dir, commitDelayMs, maxCommitWaitMs, retryMs, pullIntervalMs, maxProjectsPerOwner, maxOwners, log }
     */
    constructor(git, opts) {
        this.git = git;
        this.dir = opts.dir;
        this.commitDelayMs = opts.commitDelayMs != null ? opts.commitDelayMs : 5000;
        this.maxCommitWaitMs = opts.maxCommitWaitMs || 30000;
        this.retryMs = opts.retryMs || 30000;
        this.pullIntervalMs = opts.pullIntervalMs || 0;
        this.maxProjectsPerOwner = opts.maxProjectsPerOwner || 200;
        this.maxOwners = opts.maxOwners || 10000;
        this.maxPublicPerOwner = opts.maxPublicPerOwner || 30;
        this.maxSharesPerOwner = opts.maxSharesPerOwner || 200;
        this.shares = new Map();       // codigo -> { code, owner, name, createdAt, raw }
        this.featuredPids = opts.featuredPids || [];
        this.publicCache = null;      // lista ordenada de proyectos publicos (se arma al pedirla)
        this.log = opts.log || (() => {});

        this.owners = new Map();      // owner -> Map(id -> { id, name, savedAt, raw })
        this.queue = Promise.resolve();
        this.timer = null;
        this.firstDirty = 0;
        this.retryTimer = null;
        this.pullTimer = null;
        this.counts = { added: 0, updated: 0, removed: 0 };
        this.unpushed = false;
        this.lastCommit = 0;
        this.lastPush = 0;
        this.lastError = '';
        this.closed = false;
    }

    get projectsDir() {
        return path.join(this.dir, 'projects');
    }

    async start() {
        await this.git.init();
        this.load();
        this.log('cargados ' + this.countProjects() + ' proyectos de ' + this.owners.size + ' usuarios');
        if (this.pullIntervalMs > 0 && this.git.remote && !this.pullTimer)
            this.pullTimer = setInterval(() => this.enqueue(() => this.pullTick()), this.pullIntervalMs);
    }

    // --- Disco <-> memoria ---

    /** Reemplaza la memoria por lo que hay en disco (el disco siempre esta al dia: cada cambio se escribe enseguida). */
    load() {
        const owners = new Map();
        let skipped = 0;
        const root = this.projectsDir;
        if (fs.existsSync(root)) {
            for (const owner of fs.readdirSync(root)) {
                if (!/^[a-f0-9]{32}$/.test(owner))
                    continue;
                const dir = path.join(root, owner);
                if (!fs.statSync(dir).isDirectory())
                    continue;
                const map = new Map();
                for (const file of fs.readdirSync(dir)) {
                    const id = file.replace(/\.json$/, '');
                    if (!file.endsWith('.json') || !ID_RE.test(id))
                        continue;
                    try {
                        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
                        const rec = JSON.parse(raw);
                        const v = validateProject(rec);
                        map.set(id, { id, name: v.name, savedAt: v.savedAt, raw, pub: this.pubOf(owner, id, rec.public, v.data) });
                    } catch (e) {
                        skipped++;
                    }
                }
                if (map.size)
                    owners.set(owner, map);
            }
        }
        // Copias compartidas por enlace corto: shares/<codigo>.json
        const shares = new Map();
        const sdir = path.join(this.dir, 'shares');
        if (fs.existsSync(sdir)) {
            for (const file of fs.readdirSync(sdir)) {
                const code = file.replace(/\.json$/, '');
                if (!file.endsWith('.json') || !CODE_RE.test(code))
                    continue;
                try {
                    const raw = fs.readFileSync(path.join(sdir, file), 'utf8');
                    const rec = JSON.parse(raw);
                    const v = validateProject(rec);
                    shares.set(code, { code, owner: String(rec.owner || ''), name: v.name, createdAt: Math.round(Number(rec.createdAt) || 0), raw });
                } catch (e) {
                    skipped++;
                }
            }
        }
        this.shares = shares;
        if (skipped)
            this.log('archivos ignorados por no ser proyectos validos: ' + skipped);
        this.owners = owners;
        this.publicCache = null;
    }

    /** Datos de publicacion de un proyecto (null si es privado): lo guardado mas los derivados (estadisticas y miniatura). */
    pubOf(owner, id, saved, data) {
        if (!saved || typeof saved != 'object')
            return null;
        return {
            pid: 'p' + crypto.createHash('sha256').update(owner + ':' + id).digest('hex').slice(0, 14),
            at: typeof saved.at == 'number' && isFinite(saved.at) ? Math.round(saved.at) : Date.now(),
            author: clean(saved.author, 30),
            description: clean(saved.description, 240),
            stats: summarize(data),
            preview: previewOf(data)
        };
    }

    fileOf(owner, id) {
        return path.join(this.projectsDir, owner, id + '.json');
    }

    countProjects() {
        let n = 0;
        this.owners.forEach(m => n += m.size);
        return n;
    }

    // --- Operaciones ---

    list(owner) {
        const map = this.owners.get(owner);
        return map ? Array.from(map.values())
            .map(r => ({ id: r.id, name: r.name, savedAt: r.savedAt, size: r.raw.length, public: !!r.pub, pid: r.pub ? r.pub.pid : undefined }))
            .sort((a, b) => b.savedAt - a.savedAt) : [];
    }

    get(owner, id) {
        const map = this.owners.get(owner);
        const rec = map && map.get(id);
        return rec ? rec.raw : null;
    }

    put(owner, id, body) {
        if (!ID_RE.test(id))
            throw new HttpError(400, 'Id de proyecto invalido');
        const v = validateProject(body);
        let map = this.owners.get(owner);
        const old = map && map.get(id);
        if (!old) {
            if (!map && this.owners.size >= this.maxOwners)
                throw new HttpError(507, 'El servidor no admite mas usuarios');
            if (map && map.size >= this.maxProjectsPerOwner)
                throw new HttpError(409, 'Llegaste al maximo de ' + this.maxProjectsPerOwner + ' proyectos');
        } else if (v.savedAt < old.savedAt) {
            // Otro dispositivo guardo una version mas nueva: la mas vieja no la pisa
            throw new HttpError(409, 'El servidor tiene una version mas nueva', { savedAt: old.savedAt });
        }
        // Publicacion: sin el campo `public` se conserva lo que habia (un guardado normal no despublica)
        const before = old && old.pub;
        let saved = null;
        if (v.public === true || (v.public === undefined && before)) {
            if (!before && v.public === true) {
                let count = 0;
                if (map)
                    map.forEach(r => { if (r.pub) count++; });
                if (count >= this.maxPublicPerOwner)
                    throw new HttpError(409, 'Llegaste al maximo de ' + this.maxPublicPerOwner + ' proyectos publicos');
            }
            saved = {
                at: before ? before.at : Date.now(),
                author: v.author !== undefined ? v.author : (before ? before.author : ''),
                description: v.description !== undefined ? v.description : (before ? before.description : '')
            };
        }
        const envelope = { id, name: v.name, savedAt: v.savedAt, data: v.data };
        if (saved)
            envelope.public = saved;
        const raw = JSON.stringify(envelope);
        if (old && old.raw === raw)
            return { changed: false, savedAt: v.savedAt, pid: old.pub ? old.pub.pid : undefined };
        const file = this.fileOf(owner, id);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, raw);
        fs.renameSync(tmp, file);
        if (!map) {
            map = new Map();
            this.owners.set(owner, map);
        }
        const pub = this.pubOf(owner, id, saved, v.data);
        map.set(id, { id, name: v.name, savedAt: v.savedAt, raw, pub });
        this.publicCache = null;
        this.counts[old ? 'updated' : 'added']++;
        this.markDirty();
        return { changed: true, savedAt: v.savedAt, pid: pub ? pub.pid : undefined };
    }

    remove(owner, id) {
        if (!ID_RE.test(id))
            throw new HttpError(400, 'Id de proyecto invalido');
        const map = this.owners.get(owner);
        if (!map || !map.has(id))
            return false;
        map.delete(id);
        if (!map.size)
            this.owners.delete(owner);
        try {
            fs.unlinkSync(this.fileOf(owner, id));
        } catch (e) {}
        this.publicCache = null;
        this.counts.removed++;
        this.markDirty();
        return true;
    }

    // --- Enlaces cortos: copias de una sesion que cualquiera con el codigo puede abrir ---

    /** Guarda una copia y devuelve su codigo. Misma sesion = mismo codigo (no se duplica). */
    createShare(owner, body) {
        const v = validateProject(body);
        const digest = crypto.createHash('sha256').update(JSON.stringify({ name: v.name, data: v.data })).digest();
        let code = '';
        for (let i = 0; i < 10; i++)
            code += B62[digest[i] % 62];
        if (this.shares.has(code))
            return { code, created: false };
        let mine = 0;
        this.shares.forEach(sh => { if (sh.owner == owner) mine++; });
        if (mine >= this.maxSharesPerOwner)
            throw new HttpError(409, 'Llegaste al maximo de ' + this.maxSharesPerOwner + ' enlaces compartidos');
        const createdAt = Date.now();
        const raw = JSON.stringify({ code, owner, name: v.name, createdAt, savedAt: createdAt, data: v.data });
        const file = path.join(this.dir, 'shares', code + '.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', raw);
        fs.renameSync(file + '.tmp', file);
        this.shares.set(code, { code, owner, name: v.name, createdAt, raw });
        this.counts.added++;
        this.markDirty();
        return { code, created: true };
    }

    getShare(code) {
        const sh = CODE_RE.test(code) ? this.shares.get(code) : null;
        if (!sh)
            return null;
        const env = JSON.parse(sh.raw);
        return { code, name: env.name, createdAt: env.createdAt, data: env.data };
    }

    // --- Galeria publica ---

    /** Proyectos publicos, los mas recientes primero (con los destacados marcados). */
    publicList() {
        if (!this.publicCache) {
            const all = [];
            this.owners.forEach((map, owner) => map.forEach(r => {
                if (r.pub)
                    all.push({ owner, rec: r });
            }));
            all.sort((a, b) => b.rec.pub.at - a.rec.pub.at);
            this.publicCache = all;
        }
        return this.publicCache;
    }

    countPublic() {
        return this.publicList().length;
    }

    itemOf(entry) {
        const r = entry.rec, p = r.pub;
        return {
            pid: p.pid, name: r.name, author: p.author, description: p.description, publishedAt: p.at, savedAt: r.savedAt,
            stats: p.stats, preview: p.preview, featured: this.featuredPids.indexOf(p.pid) >= 0
        };
    }

    /** { total, items } para la landing: `featured` devuelve solo los destacados (en el orden configurado). */
    listPublic({ limit = 12, offset = 0, q = '', featured = false } = {}) {
        limit = Math.max(1, Math.min(48, limit | 0 || 12));
        offset = Math.max(0, offset | 0);
        let list = this.publicList();
        if (featured) {
            const byPid = new Map(list.map(e => [e.rec.pub.pid, e]));
            list = this.featuredPids.map(pid => byPid.get(pid)).filter(Boolean);
        }
        const needle = clean(q, 40).toLowerCase();
        if (needle)
            list = list.filter(e => (e.rec.name + ' ' + e.rec.pub.author).toLowerCase().indexOf(needle) >= 0);
        return { total: list.length, items: list.slice(offset, offset + limit).map(e => this.itemOf(e)) };
    }

    /** Un proyecto publico completo (para abrirlo en la app). */
    getPublic(pid) {
        const entry = this.publicList().find(e => e.rec.pub.pid == pid);
        if (!entry)
            return null;
        const env = JSON.parse(entry.rec.raw);
        return Object.assign({ pid }, this.itemOf(entry), { data: env.data });
    }

    /** Moderacion: deja de publicar un proyecto sin tocar el resto. */
    unpublish(pid) {
        const entry = this.publicList().find(e => e.rec.pub.pid == pid);
        if (!entry)
            return false;
        const rec = entry.rec;
        const env = JSON.parse(rec.raw);
        delete env.public;
        rec.raw = JSON.stringify(env);
        rec.pub = null;
        const file = this.fileOf(entry.owner, rec.id);
        fs.writeFileSync(file + '.tmp', rec.raw);
        fs.renameSync(file + '.tmp', file);
        this.publicCache = null;
        this.counts.updated++;
        this.markDirty();
        return true;
    }

    // --- Versionado en git ---

    get pending() {
        return this.counts.added + this.counts.updated + this.counts.removed;
    }

    /** Hay cambios sin versionar: se commitea en unos segundos (agrupando lo que llegue mientras tanto). */
    markDirty() {
        if (this.closed)
            return;
        const now = Date.now();
        if (!this.firstDirty)
            this.firstDirty = now;
        // El plazo se renueva con cada cambio, pero sin pasar de maxCommitWaitMs desde el primero
        const wait = Math.max(0, Math.min(this.commitDelayMs, this.firstDirty + this.maxCommitWaitMs - now));
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.enqueue(() => this.flush()), wait);
    }

    // Las tareas de git van de a una: nunca hay dos comandos tocando el repositorio a la vez
    enqueue(task) {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => {});
        return run;
    }

    async flush() {
        clearTimeout(this.timer);
        clearTimeout(this.retryTimer);
        this.firstDirty = 0;
        const c = this.counts;
        const summary = [c.added && c.added + ' nuevos', c.updated && c.updated + ' actualizados', c.removed && c.removed + ' borrados']
            .filter(Boolean).join(', ');
        try {
            const committed = await this.git.commitAll('Guardar proyectos' + (summary ? ': ' + summary : ''));
            if (committed) {
                this.lastCommit = Date.now();
                this.unpushed = true;
                this.counts = { added: 0, updated: 0, removed: 0 };
            }
            if (this.unpushed && this.git.remote) {
                const r = await this.git.push();
                this.unpushed = false;
                this.lastPush = Date.now();
                // Si se rebaso sobre cambios ajenos, el disco cambio: se recarga la memoria
                if (r.rebased)
                    this.load();
            } else if (!this.git.remote) {
                this.unpushed = false;
            }
            this.lastError = '';
            if (!committed)
                this.counts = { added: 0, updated: 0, removed: 0 };
        } catch (e) {
            this.lastError = this.git.scrub(e.message);
            this.log('error al versionar: ' + this.lastError);
            if (!this.closed)
                this.retryTimer = setTimeout(() => this.enqueue(() => this.flush()), this.retryMs);
        }
    }

    /** Trae lo que cambio en el remoto (por ejemplo, editado a mano en el repo) y lo carga en memoria. */
    async pullTick() {
        try {
            if (this.pending || this.unpushed) {
                await this.flush();
                return;
            }
            if (await this.git.pull()) {
                this.load();
                this.log('el repositorio avanzo: ' + this.countProjects() + ' proyectos en memoria');
            }
            this.lastError = '';
        } catch (e) {
            this.lastError = this.git.scrub(e.message);
            this.log('error al traer cambios: ' + this.lastError);
        }
    }

    health() {
        return {
            ok: !this.lastError,
            owners: this.owners.size,
            projects: this.countProjects(),
            public: this.countPublic(),
            shares: this.shares.size,
            pending: this.pending,
            unpushed: this.unpushed,
            remote: !!this.git.remote,
            lastCommit: this.lastCommit || null,
            lastPush: this.lastPush || null,
            lastError: this.lastError || null
        };
    }

    /** Al apagar: se versiona lo pendiente antes de salir. */
    async close() {
        this.closed = true;
        clearTimeout(this.timer);
        clearTimeout(this.retryTimer);
        clearInterval(this.pullTimer);
        await this.enqueue(() => this.flush());
    }
}

module.exports = { Store, HttpError, ownerOf, validateProject, ID_RE, KEY_RE, CODE_RE };
