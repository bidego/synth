'use strict';
const path = require('path');

/** Donde esta publicada la web: a ese servidor van las llamadas /api (proyectos guardados, enlaces cortos, galeria). */
const WEB_ORIGIN = 'https://synth.zondacloud.com';

/**
 * Para una ruta pedida a syntotec://synth/... devuelve que hacer:
 *  - { redirect }  la raiz va a /app/ (la landing es solo de la web)
 *  - { api }       /api/... se manda al servidor publicado
 *  - { file }      un archivo de la app compilada (las rutas sin extension caen en index.html, como en nginx)
 *  - { notFound }  fuera de la carpeta de la app o archivo que no existe
 */
function route(appDir, pathname, exists) {
    let p;
    try {
        p = decodeURIComponent(pathname);
    } catch (e) {
        return { notFound: true };
    }
    if (p === '/' || p === '')
        return { redirect: '/app/' };
    if (p === '/app')
        return { redirect: '/app/' };
    if (p.indexOf('/api/') === 0 || p === '/api')
        return { api: p };
    if (p.indexOf('/app/') !== 0)
        return { notFound: true };
    const rel = p.slice('/app/'.length);
    const file = path.normalize(path.join(appDir, rel));
    // Nada de salir de la carpeta de la app con ../
    if (file !== appDir && file.indexOf(appDir + path.sep) !== 0)
        return { notFound: true };
    if (rel === '' || rel.slice(-1) === '/')
        return { file: path.join(appDir, 'index.html') };
    if (exists(file))
        return { file };
    // Un archivo con extension que no existe es un 404 de verdad; el resto son rutas de la app
    return path.extname(rel) ? { notFound: true } : { file: path.join(appDir, 'index.html') };
}

/** Respuestas de relleno cuando no hay conexion (las mismas que da nginx sin backend). */
function offlineApi(pathname) {
    if (pathname === '/api/health')
        return { status: 200, body: '{"ok":false,"backend":false}' };
    if (pathname === '/api/public')
        return { status: 200, body: '[]' };
    return { status: 502, body: '{"ok":false,"error":"sin conexion con el servidor"}' };
}

module.exports = { WEB_ORIGIN, route, offlineApi };
