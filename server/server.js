'use strict';
// Backend de Syntotec. Recibe los proyectos que se guardan en los navegadores, los mantiene en memoria y los
// versiona en un repositorio git (el repositorio es la base de datos). El token de git vive solo aca, en una
// variable de entorno: nunca llega al navegador, ni a los logs, ni a la configuracion del repositorio.

const http = require('http');
const path = require('path');
const { Git } = require('./git');
const { Store, HttpError, ownerOf, KEY_RE } = require('./store');

function loadConfig(env) {
    const int = (v, d) => { const n = parseInt(v, 10); return isFinite(n) && n >= 0 ? n : d; };
    return {
        port: int(env.PORT, 3000),
        host: env.HOST || '0.0.0.0',
        dataDir: path.resolve(env.DATA_DIR || './data'),
        remote: env.GIT_REPO_URL || '',
        branch: env.GIT_BRANCH || 'main',
        token: env.GIT_TOKEN || '',
        authorName: env.GIT_AUTHOR_NAME || 'Syntotec',
        authorEmail: env.GIT_AUTHOR_EMAIL || 'syntotec@localhost',
        commitDelayMs: int(env.COMMIT_DELAY_MS, 5000),
        maxCommitWaitMs: int(env.MAX_COMMIT_WAIT_MS, 30000),
        retryMs: int(env.RETRY_MS, 30000),
        pullIntervalMs: int(env.PULL_INTERVAL_MS, 0),
        maxBodyBytes: int(env.MAX_BODY_BYTES, 4 * 1024 * 1024),
        maxProjectsPerOwner: int(env.MAX_PROJECTS_PER_OWNER, 200),
        maxOwners: int(env.MAX_OWNERS, 10000),
        // Pedidos por minuto: por clave de usuario (no se puede falsificar) y por IP (mas holgado: detras de un balanceador
        // todos los usuarios pueden compartir IP). PROXY_HOPS = cuantos proxies de confianza hay delante (nginx propio = 1;
        // con un balanceador de la plataforma delante de nginx = 2): se toma esa entrada contando desde el final de X-Forwarded-For.
        rateLimitPerMin: int(env.RATE_LIMIT_PER_MIN, 120),
        rateLimitIpPerMin: int(env.RATE_LIMIT_IP_PER_MIN, 600),
        proxyHops: Math.max(1, int(env.PROXY_HOPS, 1)),
        allowedOrigin: env.ALLOWED_ORIGIN || '',
        quiet: env.QUIET === '1'
    };
}

/** Limite de pedidos por IP: ventana fija de un minuto. */
class RateLimiter {
    constructor(perMin) {
        this.perMin = perMin;
        this.hits = new Map();
        this.timer = setInterval(() => this.hits.clear(), 60000);
        this.timer.unref();
    }
    allow(ip) {
        if (!this.perMin)
            return true;
        const n = (this.hits.get(ip) || 0) + 1;
        this.hits.set(ip, n);
        return n <= this.perMin;
    }
}

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const declared = parseInt(req.headers['content-length'] || '0', 10);
        if (declared > limit)
            return reject(new HttpError(413, 'El proyecto es demasiado grande (maximo ' + Math.round(limit / 1024 / 1024) + ' MB)'));
        const chunks = [];
        let size = 0;
        req.on('data', c => {
            size += c.length;
            if (size > limit) {
                reject(new HttpError(413, 'El proyecto es demasiado grande'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
            } catch (e) {
                reject(new HttpError(400, 'JSON invalido'));
            }
        });
        req.on('error', reject);
    });
}

async function createServer(config) {
    const log = config.quiet ? () => {} : m => console.log(new Date().toISOString() + ' ' + m);
    const git = new Git(path.join(config.dataDir, 'repo'), {
        remote: config.remote, branch: config.branch, token: config.token,
        authorName: config.authorName, authorEmail: config.authorEmail
    });
    const store = new Store(git, {
        dir: path.join(config.dataDir, 'repo'),
        commitDelayMs: config.commitDelayMs, maxCommitWaitMs: config.maxCommitWaitMs, retryMs: config.retryMs,
        pullIntervalMs: config.pullIntervalMs, maxProjectsPerOwner: config.maxProjectsPerOwner,
        maxOwners: config.maxOwners, log
    });
    // Si el repositorio no se puede preparar (URL o token mal puestos, sin red), el servidor NO se cae: queda en pie
    // contando el problema en /api/health y reintenta solo. Asi el error se ve sin tener que leer los logs del contenedor.
    let ready = false;
    let initError = '';
    const prepare = async () => {
        try {
            await store.start();
            ready = true;
            initError = '';
        } catch (e) {
            initError = git.scrub(e.message);
            log('No se pudo preparar el repositorio (reintento en ' + Math.round(config.retryMs / 1000) + ' s): ' + initError);
            if (!closing)
                retryTimer = setTimeout(prepare, config.retryMs);
        }
    };
    let closing = false;
    let retryTimer = null;
    await prepare();
    const ipLimiter = new RateLimiter(config.rateLimitIpPerMin);
    const keyLimiter = new RateLimiter(config.rateLimitPerMin);

    const send = (res, status, body, extra) => {
        const text = body === undefined ? '' : (typeof body == 'string' ? body : JSON.stringify(body));
        res.writeHead(status, Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }, config.allowedOrigin ? {
            'Access-Control-Allow-Origin': config.allowedOrigin,
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS'
        } : {}, extra));
        res.end(text);
    };

    // La clave del usuario viaja en el encabezado Authorization (no en la URL, que queda en los logs)
    const ownerFromRequest = req => {
        const m = /^Bearer ([a-f0-9]+)$/.exec(req.headers.authorization || '');
        if (!m || !KEY_RE.test(m[1]))
            throw new HttpError(401, 'Falta la clave de sincronizacion');
        return ownerOf(m[1]);
    };

    const handle = async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);   // ['api', 'projects', id?]
        if (req.method == 'OPTIONS')
            return send(res, 204);
        if (parts[0] != 'api')
            throw new HttpError(404, 'No existe');
        if (parts[1] == 'health' && parts.length == 2 && req.method == 'GET')
            return send(res, 200, ready ? Object.assign({ ready: true }, store.health())
                : { ok: false, ready: false, remote: !!config.remote, lastError: initError || 'preparando el repositorio' });
        if (parts[1] != 'projects' || parts.length > 3)
            throw new HttpError(404, 'No existe');
        if (!ready)
            throw new HttpError(503, 'El servidor todavia no pudo preparar su repositorio git');
        const owner = ownerFromRequest(req);
        if (!keyLimiter.allow(owner))
            throw new HttpError(429, 'Demasiados pedidos, espera un momento');
        const id = parts[2];
        if (!id) {
            if (req.method != 'GET')
                throw new HttpError(405, 'Metodo no permitido');
            return send(res, 200, store.list(owner));
        }
        if (req.method == 'GET') {
            const raw = store.get(owner, id);
            if (raw === null)
                throw new HttpError(404, 'No existe ese proyecto');
            return send(res, 200, raw);
        }
        if (req.method == 'PUT') {
            const body = await readBody(req, config.maxBodyBytes);
            return send(res, 200, store.put(owner, id, body));
        }
        if (req.method == 'DELETE') {
            store.remove(owner, id);
            return send(res, 204);
        }
        throw new HttpError(405, 'Metodo no permitido');
    };

    const server = http.createServer((req, res) => {
        // Detras de nginx la IP llega en X-Forwarded-For. Los clientes pueden agregar entradas al principio, asi que
        // se cuenta desde el final: la ultima la agrego nuestro proxy y es la unica de confianza.
        const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
        const client = chain.length ? chain[Math.max(0, chain.length - config.proxyHops)] : (req.socket.remoteAddress || '');
        if (!ipLimiter.allow(client))
            return send(res, 429, { error: 'Demasiados pedidos, espera un momento' }, { 'Retry-After': '60' });
        handle(req, res).catch(err => {
            if (err instanceof HttpError)
                return send(res, err.status, Object.assign({ error: err.message }, err.extra));
            log('error interno: ' + git.scrub(err && err.stack || err));
            send(res, 500, { error: 'Error interno' });
        });
    });
    server.requestTimeout = 30000;
    server.headersTimeout = 15000;

    await new Promise(resolve => server.listen(config.port, config.host, resolve));
    log('Syntotec backend en ' + config.host + ':' + server.address().port
        + (config.remote ? ' (repo remoto, rama ' + config.branch + (config.token ? ', con token' : ', sin token') + ')' : ' (solo repo local, sin remoto)'));

    return {
        server, store, port: server.address().port,
        async close() {
            closing = true;
            clearTimeout(retryTimer);
            const closed = new Promise(resolve => server.close(resolve));
            if (server.closeAllConnections)
                server.closeAllConnections();
            await closed;
            if (ready)
                await store.close();
        }
    };
}

module.exports = { createServer, loadConfig };

if (require.main === module) {
    createServer(loadConfig(process.env)).then(app => {
        const stop = async () => {
            await app.close();
            process.exit(0);
        };
        process.on('SIGTERM', stop);
        process.on('SIGINT', stop);
    }).catch(err => {
        console.error('No se pudo iniciar:', err.message);
        process.exit(1);
    });
}
