'use strict';
// Los proyectos viven en memoria; cada cambio se escribe a disco enseguida y se versiona en git en tandas
// (un commit cada pocos segundos con todo lo que cambio, y push). El repositorio es la base de datos:
// al arrancar se trae del remoto y se carga todo en memoria.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const KEY_RE = /^[a-f0-9]{32,128}$/;

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
    const name = typeof body.name == 'string' ? body.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : '';
    if (!name)
        throw new HttpError(400, 'Falta el nombre del proyecto');
    const data = body.data;
    const isV2 = data && typeof data == 'object' && data.rack && typeof data.rack == 'object' && Array.isArray(data.rack.modules);
    const isV1 = data && typeof data == 'object' && Array.isArray(data.tracks);
    if (!isV2 && !isV1)
        throw new HttpError(400, 'Los datos no parecen un proyecto de Syntotec');
    const savedAt = typeof body.savedAt == 'number' && isFinite(body.savedAt) ? Math.round(body.savedAt) : Date.now();
    return { name, savedAt, data };
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
                        map.set(id, { id, name: v.name, savedAt: v.savedAt, raw });
                    } catch (e) {
                        skipped++;
                    }
                }
                if (map.size)
                    owners.set(owner, map);
            }
        }
        if (skipped)
            this.log('archivos ignorados por no ser proyectos validos: ' + skipped);
        this.owners = owners;
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
            .map(r => ({ id: r.id, name: r.name, savedAt: r.savedAt, size: r.raw.length }))
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
        const raw = JSON.stringify({ id, name: v.name, savedAt: v.savedAt, data: v.data });
        if (old && old.raw === raw)
            return { changed: false, savedAt: v.savedAt };
        const file = this.fileOf(owner, id);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, raw);
        fs.renameSync(tmp, file);
        if (!map) {
            map = new Map();
            this.owners.set(owner, map);
        }
        map.set(id, { id, name: v.name, savedAt: v.savedAt, raw });
        this.counts[old ? 'updated' : 'added']++;
        this.markDirty();
        return { changed: true, savedAt: v.savedAt };
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
        this.counts.removed++;
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

module.exports = { Store, HttpError, ownerOf, validateProject, ID_RE, KEY_RE };
