'use strict';
const assert = require('assert');
const path = require('path');
const { route, offlineApi } = require('../lib');

const dir = path.resolve('/x/app');
const has = set => f => set.indexOf(f) >= 0;
const files = [path.join(dir, 'main.js'), path.join(dir, 'assets', 'sounds', 'a.js'), path.join(dir, 'index.html')];

assert.deepStrictEqual(route(dir, '/', has(files)), { redirect: '/app/' });
assert.deepStrictEqual(route(dir, '/app', has(files)), { redirect: '/app/' });
assert.deepStrictEqual(route(dir, '/app/', has(files)), { file: path.join(dir, 'index.html') });
assert.deepStrictEqual(route(dir, '/app/main.js', has(files)), { file: path.join(dir, 'main.js') });
assert.deepStrictEqual(route(dir, '/app/assets/sounds/a.js', has(files)), { file: path.join(dir, 'assets', 'sounds', 'a.js') });
assert.deepStrictEqual(route(dir, '/app/falta.js', has(files)), { notFound: true });
assert.deepStrictEqual(route(dir, '/app/alguna/ruta', has(files)), { file: path.join(dir, 'index.html') });
assert.deepStrictEqual(route(dir, '/api/health', has(files)), { api: '/api/health' });
assert.deepStrictEqual(route(dir, '/api/shares/abc', has(files)), { api: '/api/shares/abc' });
assert.deepStrictEqual(route(dir, '/otra', has(files)), { notFound: true });
// No se puede salir de la carpeta de la app
assert.deepStrictEqual(route(dir, '/app/../secreto.txt', has(files)), { notFound: true });
assert.deepStrictEqual(route(dir, '/app/%2e%2e/secreto.txt', has(files)), { notFound: true });
assert.deepStrictEqual(route(dir, '/app/..%2f..%2fetc/passwd', has(files)), { notFound: true });
assert.strictEqual(offlineApi('/api/health').status, 200);
assert.strictEqual(offlineApi('/api/shares/x').status, 502);
console.log('lib.test.js: ok');
