'use strict';
// Pruebas del backend con un repositorio remoto de verdad (un bare local): node test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { createServer, loadConfig } = require('./server');
const { Git } = require('./git');

let fails = 0, total = 0;
const ok = (name, cond, extra) => { total++; console.log((cond ? '  OK   ' : '  FALLA') + ' ' + name + (extra !== undefined && !cond ? '  [' + extra + ']' : '')); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); } return false; };
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }) }).trim();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'syntotec-srv-'));
const remote = path.join(tmp, 'remote.git');
execFileSync('git', ['init', '--bare', remote]);
// El HEAD del bare apunta a main
execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: remote });
const TOKEN = 'ghp_TESTTOKEN' + crypto.randomBytes(8).toString('hex');

const owner2 = k => require('./store').ownerOf(k);
const key = () => crypto.randomBytes(32).toString('hex');
const project = (n = 1) => ({ name: 'Mi tema ' + n, savedAt: Date.now(), data: { version: 2, rack: { modules: [{ id: 'm1', type: 'synth' }], cables: [] }, transport: { bpm: 100 + n } } });
const api = (port, method, url, { k, body, raw } = {}) => new Promise((resolve, reject) => {
    const http = require('http');
    const data = raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined);
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: Object.assign({}, k ? { Authorization: 'Bearer ' + k } : {}, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, res => {
        let t = ''; res.on('data', c => t += c); res.on('end', () => { let j; try { j = JSON.parse(t); } catch (e) {} resolve({ status: res.statusCode, json: j, text: t }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
});
const rawHealth = (port, xff) => new Promise((resolve, reject) => {
    require('http').get({ host: '127.0.0.1', port, path: '/api/health', headers: { 'X-Forwarded-For': xff } }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); }).on('error', reject);
});
const start = async (dataDir, extra = {}) => {
    const logs = [];
    const orig = console.log;
    const env = Object.assign({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir, GIT_REPO_URL: remote, GIT_BRANCH: 'main', GIT_TOKEN: TOKEN, COMMIT_DELAY_MS: '250', MAX_COMMIT_WAIT_MS: '2000', RETRY_MS: '400', RATE_LIMIT_PER_MIN: '100000' }, extra);
    console.log = (...a) => { logs.push(a.join(' ')); };
    try {
        const app = await createServer(Object.assign(loadConfig(env), { quiet: false }));
        app.logs = logs;
        return app;
    } finally { console.log = orig; }
};
const remoteFiles = () => git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(Boolean);
const remoteCommits = () => { try { return parseInt(git(remote, 'rev-list', '--count', 'main'), 10); } catch (e) { return 0; } };

(async () => {
    const dataA = path.join(tmp, 'dataA');
    let app = await start(dataA);
    const kA = key(), kB = key();
    const owner = require('./store').ownerOf(kA);

    console.log('Guardar y leer');
    let r = await api(app.port, 'PUT', '/api/projects/tema-1', { k: kA, body: project(1) });
    ok('PUT crea el proyecto', r.status == 200 && r.json.changed === true, r.text);
    r = await api(app.port, 'GET', '/api/projects/tema-1', { k: kA });
    ok('GET lo devuelve igual', r.status == 200 && r.json.name == 'Mi tema 1' && r.json.data.transport.bpm == 101, r.text.slice(0, 100));
    r = await api(app.port, 'GET', '/api/projects', { k: kA });
    ok('el listado trae el proyecto con su tamano', r.status == 200 && r.json.length == 1 && r.json[0].id == 'tema-1' && r.json[0].size > 50, r.text);
    r = await api(app.port, 'PUT', '/api/projects/tema-1', { k: kA, body: Object.assign(project(1), { savedAt: JSON.parse((await api(app.port, 'GET', '/api/projects/tema-1', { k: kA })).text).savedAt }) });
    ok('guardar lo mismo no cambia nada', r.status == 200 && r.json.changed === false, r.text);

    console.log('Git: commit y push');
    ok('el repo remoto recibe el commit', await until(() => remoteCommits() >= 1 && remoteFiles().length == 1), remoteFiles().join());
    ok('el archivo esta en projects/<hash del dueno>/<id>.json', remoteFiles()[0] == 'projects/' + owner + '/tema-1.json', remoteFiles()[0]);
    ok('el dueno del repo no revela la clave', !remoteFiles()[0].includes(kA.slice(0, 16)));
    const filePath = path.join(dataA, 'repo', remoteFiles()[0]);
    ok('el contenido del repo es el proyecto', JSON.parse(fs.readFileSync(filePath, 'utf8')).name == 'Mi tema 1');
    ok('el mensaje del commit resume el cambio', /Guardar proyectos: 1 nuevos/.test(git(remote, 'log', '-1', '--format=%s', 'main')), git(remote, 'log', '-1', '--format=%s', 'main'));
    ok('el autor del commit es el configurado', git(remote, 'log', '-1', '--format=%an', 'main') == 'Syntotec');

    console.log('Seguridad');
    const cfg = fs.readFileSync(path.join(dataA, 'repo', '.git', 'config'), 'utf8');
    ok('el token no esta en la configuracion del repo', !cfg.includes(TOKEN) && !cfg.includes('x-access-token'), cfg);
    let leaked = false;
    try { execFileSync('grep', ['-rl', kA, path.join(dataA, 'repo')]); leaked = true; } catch (e) { leaked = false; }
    ok('ni la clave aparece en el repo local', !leaked);
    ok('el token no aparece en los logs', !app.logs.join('\n').includes(TOKEN));
    r = await api(app.port, 'GET', '/api/health');
    ok('/api/health no expone secretos', r.status == 200 && !r.text.includes(TOKEN) && r.json.remote === true && r.json.projects == 1, r.text);
    ok('el scrub borra el token de los mensajes', !new Git('/tmp/x', { token: TOKEN }).scrub('fatal: https://u:' + TOKEN + '@github.com/x ' + TOKEN).includes(TOKEN));
    r = await api(app.port, 'GET', '/api/projects/tema-1');
    ok('sin clave: 401', r.status == 401);
    r = await api(app.port, 'GET', '/api/projects/tema-1', { k: 'no-es-hex' });
    ok('clave invalida: 401', r.status == 401);
    r = await api(app.port, 'GET', '/api/projects/tema-1', { k: kB });
    ok('otro usuario no ve el proyecto (404)', r.status == 404);
    r = await api(app.port, 'GET', '/api/projects', { k: kB });
    ok('ni en el listado', r.status == 200 && r.json.length == 0);
    for (const bad of ['..%2F..%2Fetc%2Fpasswd', '.hidden', 'A_B', 'x'.repeat(61), 'a%00b']) {
        r = await api(app.port, 'PUT', '/api/projects/' + bad, { k: kA, body: project(2) });
        ok('id peligroso rechazado: ' + bad.slice(0, 20), r.status == 400 || r.status == 404, r.status);
    }
    r = await api(app.port, 'PUT', '/api/projects/ok', { k: kA, raw: '{"name":' });
    ok('JSON roto: 400', r.status == 400);
    r = await api(app.port, 'PUT', '/api/projects/ok', { k: kA, body: { name: 'x', data: { hola: 1 } } });
    ok('datos que no son un proyecto: 400', r.status == 400, r.text);
    r = await api(app.port, 'PUT', '/api/projects/ok', { k: kA, body: { data: project().data } });
    ok('sin nombre: 400', r.status == 400);
    r = await api(app.port, 'PUT', '/api/projects/big', { k: kA, raw: JSON.stringify({ name: 'grande', data: { rack: { modules: [] }, pad: 'x'.repeat(5 * 1024 * 1024) } }) });
    ok('mas de 4 MB: 413', r.status == 413, r.status);
    r = await api(app.port, 'POST', '/api/projects/ok', { k: kA, body: project() });
    ok('metodo no permitido: 405', r.status == 405);
    r = await api(app.port, 'GET', '/etc/passwd');
    ok('rutas fuera de /api: 404', r.status == 404);

    console.log('Versiones: una mas vieja no pisa a una mas nueva');
    const newer = project(3); newer.savedAt = Date.now() + 100000;
    await api(app.port, 'PUT', '/api/projects/tema-3', { k: kA, body: newer });
    const older = project(3); older.savedAt = newer.savedAt - 5000; older.data.transport.bpm = 999;
    r = await api(app.port, 'PUT', '/api/projects/tema-3', { k: kA, body: older });
    ok('conflicto: 409 con la fecha del servidor', r.status == 409 && r.json.savedAt == newer.savedAt, r.text);
    r = await api(app.port, 'GET', '/api/projects/tema-3', { k: kA });
    ok('el servidor conserva la version nueva', r.json.data.transport.bpm == 103);

    console.log('Varias escrituras a la vez');
    await Promise.all(Array.from({ length: 20 }, (_, i) => api(app.port, 'PUT', '/api/projects/par-' + i, { k: kA, body: project(10 + i) })));
    ok('los 22 proyectos quedan en el remoto', await until(() => remoteFiles().length == 22), remoteFiles().length);
    ok('los commits se agrupan (no uno por proyecto)', remoteCommits() < 15, remoteCommits());

    console.log('Borrar');
    r = await api(app.port, 'DELETE', '/api/projects/par-0', { k: kA });
    ok('DELETE: 204', r.status == 204);
    ok('el archivo desaparece del remoto', await until(() => !remoteFiles().some(f => f.endsWith('par-0.json'))));
    r = await api(app.port, 'GET', '/api/projects/par-0', { k: kA });
    ok('y ya no se puede leer', r.status == 404);

    console.log('El repositorio es la base de datos');
    await app.close();
    app = await start(path.join(tmp, 'dataB'));   // carpeta nueva y vacia: todo sale del repo
    r = await api(app.port, 'GET', '/api/projects', { k: kA });
    ok('un servidor nuevo levanta los proyectos del repo en memoria', r.status == 200 && r.json.length == 21, r.json && r.json.length);
    r = await api(app.port, 'GET', '/api/projects/tema-1', { k: kA });
    ok('y los sirve completos', r.status == 200 && r.json.name == 'Mi tema 1');

    console.log('Cambios hechos fuera del servidor');
    await app.close();
    app = await start(path.join(tmp, 'dataB'), { PULL_INTERVAL_MS: '300' });
    const other = path.join(tmp, 'otro-clon');
    execFileSync('git', ['clone', '-q', remote, other]);
    const f = path.join(other, 'projects', owner, 'a-mano.json');
    fs.writeFileSync(f, JSON.stringify({ id: 'a-mano', name: 'Editado a mano', savedAt: Date.now(), data: project(5).data }));
    git(other, 'add', '-A'); git(other, 'commit', '-q', '-m', 'edicion manual'); git(other, 'push', '-q', 'origin', 'HEAD:main');
    ok('un commit hecho a mano en el repo aparece en memoria', await until(async () => (await api(app.port, 'GET', '/api/projects/a-mano', { k: kA })).status == 200, 6000));

    console.log('Si el remoto falla, se reintenta');
    const hidden = remote + '.oculto';
    fs.renameSync(remote, hidden);
    await api(app.port, 'PUT', '/api/projects/cuando-no-hay-remoto', { k: kA, body: project(7) });
    ok('el servidor sigue respondiendo y avisa el error', await until(async () => { const h = (await api(app.port, 'GET', '/api/health')).json; return h.lastError && h.unpushed; }), JSON.stringify((await api(app.port, 'GET', '/api/health')).json));
    ok('el error no trae el token', !JSON.stringify((await api(app.port, 'GET', '/api/health')).json).includes(TOKEN));
    r = await api(app.port, 'GET', '/api/projects/cuando-no-hay-remoto', { k: kA });
    ok('mientras tanto el dato esta a salvo en memoria', r.status == 200);
    fs.renameSync(hidden, remote);
    ok('al volver el remoto, se sube solo', await until(() => remoteFiles().some(f => f.endsWith('cuando-no-hay-remoto.json')), 10000));
    ok('y el estado vuelve a estar sano', await until(async () => { const h = (await api(app.port, 'GET', '/api/health')).json; return !h.lastError && !h.unpushed; }));

    console.log('Limites');
    await app.close();
    app = await start(path.join(tmp, 'dataC'), { RATE_LIMIT_IP_PER_MIN: '5', RATE_LIMIT_PER_MIN: '4' });
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await api(app.port, 'GET', '/api/health')).status);
    ok('demasiados pedidos desde una IP: 429', statuses.slice(0, 5).every(s => s == 200) && statuses.slice(5).every(s => s == 429), statuses.join());
    await app.close();
    app = await start(path.join(tmp, 'dataC2'), { RATE_LIMIT_IP_PER_MIN: '5' });
    const spoof = [];
    for (let i = 0; i < 8; i++) spoof.push((await rawHealth(app.port, '10.9.8.' + i + ', 203.0.113.9')).status);   // lo ultimo lo agrega nginx
    ok('falsificar X-Forwarded-For no evita el limite de IP', spoof.slice(5).every(s => s == 429), spoof.join());
    await app.close();
    app = await start(path.join(tmp, 'dataC3'), { RATE_LIMIT_IP_PER_MIN: '5', PROXY_HOPS: '2' });
    const behind = [];
    for (let i = 0; i < 8; i++) behind.push((await rawHealth(app.port, '10.9.8.' + i + ', 172.16.0.1')).status);
    ok('detras de un balanceador (PROXY_HOPS=2) cada cliente cuenta por separado', behind.every(s => s == 200), behind.join());
    await app.close();
    app = await start(path.join(tmp, 'dataC4'), { RATE_LIMIT_PER_MIN: '4' });
    const kLim = key(), kOther = key(), perKey = [];
    for (let i = 0; i < 7; i++) perKey.push((await api(app.port, 'GET', '/api/projects', { k: kLim })).status);
    ok('limite por clave de usuario: 429 al pasarse', perKey.slice(0, 4).every(s => s == 200) && perKey.slice(4).every(s => s == 429), perKey.join());
    ok('y otra clave no se ve afectada', (await api(app.port, 'GET', '/api/projects', { k: kOther })).status == 200);
    await app.close();
    app = await start(path.join(tmp, 'dataD'), { MAX_PROJECTS_PER_OWNER: '2' });
    const k3 = key();
    await api(app.port, 'PUT', '/api/projects/a1', { k: k3, body: project(1) });
    await api(app.port, 'PUT', '/api/projects/a2', { k: k3, body: project(2) });
    r = await api(app.port, 'PUT', '/api/projects/a3', { k: k3, body: project(3) });
    ok('maximo de proyectos por usuario: 409', r.status == 409, r.status);
    r = await api(app.port, 'PUT', '/api/projects/a2', { k: k3, body: Object.assign(project(2), { savedAt: Date.now() + 5000 }) });
    ok('actualizar uno existente sigue permitido', r.status == 200);

    console.log('Apagado ordenado');
    r = await api(app.port, 'PUT', '/api/projects/ultimo', { k: key(), body: project(9) });
    ok('el ultimo guardado entra', r.status == 200 && r.json.changed, r.text);
    await app.close();   // sin esperar el temporizador: close() versiona lo pendiente
    ok('al apagar se versiona lo pendiente', remoteFiles().some(f => f.endsWith('ultimo.json')));

    console.log('Si el repositorio no se puede preparar, el servidor no se cae');
    const missing = path.join(tmp, 'todavia-no-existe.git');
    app = await start(path.join(tmp, 'dataF'), { GIT_REPO_URL: missing });
    r = await api(app.port, 'GET', '/api/health');
    ok('queda en pie y cuenta el problema en /api/health', r.status == 200 && r.json.ok === false && r.json.ready === false && /git|repository|fetch/i.test(r.json.lastError || ''), r.text);
    ok('el problema no incluye el token', !r.text.includes(TOKEN));
    r = await api(app.port, 'PUT', '/api/projects/x', { k: key(), body: project(1) });
    ok('mientras tanto los proyectos responden 503', r.status == 503, r.status);
    execFileSync('git', ['init', '--bare', '-q', missing]); execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: missing });
    ok('al aparecer el repositorio, se prepara solo', await until(async () => (await api(app.port, 'GET', '/api/health')).json.ready === true, 8000));
    r = await api(app.port, 'PUT', '/api/projects/x', { k: key(), body: project(1) });
    ok('y entonces guarda', r.status == 200, r.text);
    await app.close();

    console.log('Galeria publica');
    app = await start(path.join(tmp, 'dataP'), { MAX_PUBLIC_PER_OWNER: '3', ADMIN_TOKEN: 'admin-secreto-123' });
    const kP = key();
    const richData = () => ({ version: 2, transport: { bpm: 120, bars: 2, numerator: 4, denominator: 4 }, rack: { modules: [
        { id: 'm1', type: 'keyboard' },
        { id: 'm2', type: 'synth', name: 'Synth', state: { sequencer: { tracks: [
            { id: 1, name: 'Bajo', patch: { name: 'Sub Bass', kind: 'synth' }, notes: Array.from({ length: 10 }, (_, i) => ({ start: i * 0.5, dur: 0.4, midi: 36 + (i % 3), vel: 0.8, take: 1 })) },
            { id: 2, name: 'Bombo', patch: { name: 'Standard Kit', kind: 'kit' }, notes: [{ start: 0, dur: 0.2, midi: 36 }, { start: 2, dur: 0.2, midi: 36 }] }
        ] } } },
        { id: 'm3', type: 'delay' }, { id: 'm4', type: 'output' }], cables: [] }, automation: { lanes: [{ module: 'm3', param: 'p.mix', points: [[0, 0.1]] }] } });
    r = await api(app.port, 'PUT', '/api/projects/pub-uno', { k: kP, body: { name: 'Mi cancion', savedAt: Date.now(), data: richData() } });
    ok('un proyecto nuevo es privado', r.status == 200 && r.json.pid === undefined, r.text);
    r = await api(app.port, 'GET', '/api/public');
    ok('la galeria publica empieza vacia y no pide clave', r.status == 200 && r.json.total == 0 && r.json.items.length == 0, r.text);
    r = await api(app.port, 'PUT', '/api/projects/pub-uno', { k: kP, body: { name: 'Mi cancion', savedAt: Date.now() + 1, data: richData(), public: true, author: '  Gon\u2028zalo\n<img src=x onerror=alert(1)>  ', description: 'Un loop de prueba' } });
    ok('publicar devuelve el id publico', r.status == 200 && /^p[a-f0-9]{14}$/.test(r.json.pid), r.text);
    const pid = r.json.pid;
    r = await api(app.port, 'GET', '/api/public');
    const it = r.json.items[0] || {};
    ok('el proyecto aparece en la galeria', r.json.total == 1 && it.pid == pid && it.name == 'Mi cancion', r.text.slice(0, 200));
    ok('con sus estadisticas (bpm, pistas, notas, instrumentos, duracion)', it.stats && it.stats.bpm == 120 && it.stats.tracks == 2 && it.stats.notes == 12 && it.stats.instruments.join() == 'Sub Bass,Standard Kit' && it.stats.seconds == 4 && it.stats.effects == 1 && it.stats.automation == 1, JSON.stringify(it.stats));
    ok('y una miniatura liviana con las notas', it.preview && it.preview.loopBeats == 8 && it.preview.tracks.length == 2 && it.preview.tracks[0].notes.length == 10 && it.preview.tracks[1].drums === true, JSON.stringify(it.preview).slice(0, 160));
    ok('el listado publico no trae el proyecto entero', !('data' in it));
    ok('el autor queda saneado (sin saltos ni caracteres de control)', !/[\n\u2028]/.test(it.author) && it.author.length <= 30, JSON.stringify(it.author));
    ok('el listado no revela al dueno ni su clave', !r.text.includes(kP) && !r.text.includes(require('./store').ownerOf(kP)));
    r = await api(app.port, 'GET', '/api/public/' + pid);
    ok('cualquiera abre el proyecto publico completo', r.status == 200 && r.json.data.rack.modules.length == 4 && r.json.name == 'Mi cancion', r.text.slice(0, 120));
    r = await api(app.port, 'GET', '/api/public/pabcdefabcdef12');
    ok('un id publico inexistente: 404', r.status == 404);
    r = await api(app.port, 'GET', '/api/public/..%2F..%2Fx');
    ok('un id publico invalido: 404', r.status == 404);
    r = await api(app.port, 'PUT', '/api/projects/pub-uno', { k: kP, body: { name: 'Mi cancion', savedAt: Date.now() + 2, data: richData() } });
    ok('un guardado normal (sin el campo public) no despublica', r.status == 200 && r.json.pid == pid, r.text);
    r = await api(app.port, 'GET', '/api/projects', { k: kP });
    ok('el listado privado marca cuales son publicos', r.json.some(x => x.id == 'pub-uno' && x.public === true && x.pid == pid), r.text);
    for (let i = 2; i <= 3; i++)
        await api(app.port, 'PUT', '/api/projects/pub-' + i, { k: kP, body: { name: 'Tema ' + i, savedAt: Date.now(), data: richData(), public: true } });
    r = await api(app.port, 'PUT', '/api/projects/pub-4', { k: kP, body: { name: 'Tema 4', savedAt: Date.now(), data: richData(), public: true } });
    ok('maximo de proyectos publicos por usuario: 409', r.status == 409, r.text);
    r = await api(app.port, 'GET', '/api/public?limit=2');
    ok('paginado: limit', r.json.total == 3 && r.json.items.length == 2);
    r = await api(app.port, 'GET', '/api/public?limit=2&offset=2');
    ok('paginado: offset', r.json.items.length == 1);
    ok('los mas recientes van primero', (await api(app.port, 'GET', '/api/public')).json.items[0].name == 'Tema 3');
    r = await api(app.port, 'GET', '/api/public?q=cancion');
    ok('busqueda por nombre', r.json.total == 1 && r.json.items[0].pid == pid);
    r = await api(app.port, 'PUT', '/api/projects/pub-uno', { k: kP, body: { name: 'Mi cancion', savedAt: Date.now() + 3, data: richData(), public: false } });
    ok('dejar de publicar', r.status == 200 && r.json.pid === undefined, r.text);
    ok('sale de la galeria', (await api(app.port, 'GET', '/api/public/' + pid)).status == 404 && (await api(app.port, 'GET', '/api/public')).json.total == 2);
    r = await api(app.port, 'GET', '/api/projects/pub-uno', { k: kP });
    ok('y el dueno sigue teniendo su proyecto', r.status == 200 && r.json.name == 'Mi cancion');
    const target = (await api(app.port, 'GET', '/api/public')).json.items[0].pid;
    r = await api(app.port, 'DELETE', '/api/admin/public/' + target, { k: 'a'.repeat(32) });
    ok('moderacion: una clave de usuario no sirve (401)', r.status == 401);
    const adm = await new Promise(resolve => { const q = require('http').request({ host: '127.0.0.1', port: app.port, method: 'DELETE', path: '/api/admin/public/' + target, headers: { Authorization: 'Bearer admin-secreto-123' } }, res => { res.resume(); resolve(res.statusCode); }); q.end(); });
    ok('moderacion: el administrador despublica (204)', adm == 204);
    ok('y desaparece de la galeria', (await api(app.port, 'GET', '/api/public/' + target)).status == 404);
    ok('la publicacion se versiona en el repo (campo public en el archivo)', await until(() => { try { return execFileSync('git', ['show', 'main:projects/' + owner2(kP) + '/pub-uno.json'], { cwd: remote, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).length > 10; } catch (e) { return false; } }, 8000));
    await app.close();
    app = await start(path.join(tmp, 'dataP2'), { FEATURED_PIDS: pid + ',pffffffffffffff' });
    r = await api(app.port, 'GET', '/api/public?featured=1');
    ok('un servidor nuevo levanta lo publicado desde el repo', r.status == 200, r.status);
    await app.close();

    console.log('Enlaces cortos');
    app = await start(path.join(tmp, 'dataS'));
    const kS = key();
    const shareBody = Object.assign(project(1), { name: 'Para compartir' });
    r = await api(app.port, 'POST', '/api/shares', { body: shareBody });
    ok('crear un enlace requiere clave (401)', r.status == 401);
    r = await api(app.port, 'POST', '/api/shares', { k: kS, body: shareBody });
    ok('crear un enlace devuelve un codigo corto de 10 caracteres', r.status == 200 && /^[0-9A-Za-z]{10}$/.test(r.json.code) && r.json.created === true, r.text);
    const code = r.json.code;
    r = await api(app.port, 'GET', '/api/shares/' + code);
    ok('cualquiera con el codigo abre la sesion (sin clave)', r.status == 200 && r.json.name == 'Para compartir' && r.json.data.transport.bpm == 101, r.text.slice(0, 100));
    r = await api(app.port, 'POST', '/api/shares', { k: key(), body: shareBody });
    ok('la misma sesion da el mismo codigo (no se duplica)', r.status == 200 && r.json.code == code && r.json.created === false, r.text);
    r = await api(app.port, 'GET', '/api/shares/zzzzzzzzzz');
    ok('un codigo que no existe: 404', r.status == 404);
    for (const bad of ['..%2Fx', 'corto', 'x'.repeat(30), '%00%00%00%00%00%00%00%00%00%00']) {
        r = await api(app.port, 'GET', '/api/shares/' + bad);
        ok('codigo invalido rechazado: ' + bad.slice(0, 12), r.status == 404 || r.status == 400, r.status);
    }
    r = await api(app.port, 'POST', '/api/shares', { k: kS, body: { name: 'x', data: { hola: 1 } } });
    ok('datos invalidos al compartir: 400', r.status == 400);
    ok('el enlace corto llega al repo', await until(() => remoteFiles().some(f => f == 'shares/' + code + '.json'), 8000), remoteFiles().filter(f => f.startsWith('shares')).join());
    await app.close();
    app = await start(path.join(tmp, 'dataS2'));
    r = await api(app.port, 'GET', '/api/shares/' + code);
    ok('un servidor nuevo levanta los enlaces del repo', r.status == 200 && r.json.name == 'Para compartir', r.status);
    await app.close();
    app = await start(path.join(tmp, 'dataS3'), { MAX_SHARES_PER_OWNER: '2' });
    const kQ = key();
    for (let i = 0; i < 2; i++) await api(app.port, 'POST', '/api/shares', { k: kQ, body: Object.assign(project(20 + i), { name: 'q' + i }) });
    r = await api(app.port, 'POST', '/api/shares', { k: kQ, body: Object.assign(project(30), { name: 'q3' }) });
    ok('maximo de enlaces por usuario: 409', r.status == 409, r.status);
    await app.close();

    console.log('Sin remoto (solo repo local)');
    app = await start(path.join(tmp, 'dataE'), { GIT_REPO_URL: '', GIT_TOKEN: '' });
    await api(app.port, 'PUT', '/api/projects/local', { k: k3, body: project(1) });
    ok('funciona y commitea localmente', await until(() => { try { return git(path.join(tmp, 'dataE', 'repo'), 'log', '--oneline').length > 0; } catch (e) { return false; } }));
    r = await api(app.port, 'GET', '/api/health');
    ok('la salud dice que no hay remoto', r.json.remote === false && !r.json.lastError, r.text);
    await app.close();

    console.log(fails ? '\n' + fails + ' FALLAS de ' + total : '\nTODO OK (' + total + ' chequeos)');
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
