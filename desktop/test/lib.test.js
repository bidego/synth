'use strict';
const assert = require('assert');
const path = require('path');
const { route, offlineApi, permissionAllowed, wantsAudioInput } = require('../lib');

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
// Permisos: MIDI si; la entrada de audio si, pero nunca la camara
assert.strictEqual(permissionAllowed('midi'), true);
assert.strictEqual(permissionAllowed('geolocation'), false);
assert.strictEqual(permissionAllowed('media', { mediaTypes: ['audio'] }), true);
assert.strictEqual(permissionAllowed('media', { mediaType: 'audio' }), true);
assert.strictEqual(permissionAllowed('media', { mediaTypes: ['video'] }), false);
assert.strictEqual(permissionAllowed('media', { mediaTypes: ['audio', 'video'] }), false);
assert.strictEqual(permissionAllowed('media', { mediaType: 'unknown' }), false);
assert.strictEqual(permissionAllowed('media', {}), false);
assert.strictEqual(permissionAllowed('media'), false);
assert.strictEqual(wantsAudioInput('media', { mediaTypes: ['audio'] }), true);
assert.strictEqual(wantsAudioInput('midi', {}), false);
console.log('lib.test.js: ok');
