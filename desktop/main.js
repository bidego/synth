'use strict';
const { app, BrowserWindow, Menu, dialog, net, protocol, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { WEB_ORIGIN, route, offlineApi } = require('./lib');

const APP_DIR = path.join(__dirname, 'app');
const SCHEME = 'syntotec';

// La app se sirve por un esquema propio (como si fuera un sitio): asi las rutas, fetch, audio y MIDI andan
// igual que en la web, y /api llega al servidor publicado sin tocar el codigo de la app
protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

// Permisos que la app puede usar. Chromium pide MIDI como 'midi' (y 'midiSysex' si la pagina lo pide)
const PERMISSIONS = ['midi', 'midiSysex', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'unknown'];
// Registro de lo que se pidio, para el diagnostico del menu Ayuda
const permLog = [];

let win = null;

function handleRequest(request) {
    const url = new URL(request.url);
    const r = route(APP_DIR, url.pathname, f => fs.existsSync(f) && fs.statSync(f).isFile());
    if (r.redirect)
        return Response.redirect(SCHEME + '://synth' + r.redirect, 302);
    if (r.api) {
        const init = { method: request.method, headers: request.headers, bypassCustomProtocolHandlers: true };
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = request.body;
            init.duplex = 'half';
        }
        return net.fetch(WEB_ORIGIN + url.pathname + url.search, init).catch(() => {
            const o = offlineApi(url.pathname);
            return new Response(o.body, { status: o.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        });
    }
    if (r.file)
        return net.fetch(pathToFileURL(r.file).toString(), { bypassCustomProtocolHandlers: true });
    return new Response('No encontrado', { status: 404 });
}

function createWindow() {
    win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#06070d',
        title: 'Syntotec',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            // El audio arranca sin esperar un clic (la app igual lo pide al primer toque)
            autoplayPolicy: 'no-user-gesture-required',
            backgroundThrottling: false
        }
    });
    win.loadURL(SCHEME + '://synth/app/');
    // Los enlaces externos se abren en el navegador, no dentro de la app
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url))
            shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith(SCHEME + '://')) {
            e.preventDefault();
            if (/^https?:/i.test(url))
                shell.openExternal(url);
        }
    });
    win.on('closed', () => win = null);
}

function buildMenu() {
    const template = [
        { role: 'appMenu' },
        { role: 'editMenu' },
        {
            label: 'Ver',
            submenu: [
                { role: 'reload', label: 'Recargar' },
                { role: 'togglefullscreen', label: 'Pantalla completa' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Zoom normal' },
                { role: 'zoomIn', label: 'Acercar' },
                { role: 'zoomOut', label: 'Alejar' },
                { type: 'separator' },
                { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }
            ]
        },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                { label: 'Syntotec en la web', click: () => shell.openExternal(WEB_ORIGIN) },
                {
                    label: 'Diagnostico de permisos (MIDI)',
                    click: () => dialog.showMessageBox(win, {
                        type: 'info',
                        message: 'Permisos pedidos por la app',
                        detail: 'Syntotec ' + app.getVersion() + ' \u00b7 Electron ' + process.versions.electron + '\n\n'
                            + (permLog.length ? permLog.join('\n') : 'Todavia no se pidio ningun permiso.')
                    })
                }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    protocol.handle(SCHEME, handleRequest);
    // La app solo carga su propio contenido: se conceden los permisos que usa (MIDI y poco mas), nunca camara, microfono ni ubicacion
    const grant = (kind, permission, origin) => {
        const ok = (!origin || origin.indexOf(SCHEME + '://') === 0) && PERMISSIONS.indexOf(permission) >= 0;
        permLog.push(kind + ' ' + permission + ' ' + (origin || '-') + ' -> ' + (ok ? 'permitido' : 'DENEGADO'));
        if (permLog.length > 60)
            permLog.shift();
        return ok;
    };
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) =>
        cb(grant('pedido', permission, details && details.requestingUrl || (wc && wc.getURL()))));
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin) =>
        grant('consulta', permission, origin || (wc && wc.getURL())));
    buildMenu();
    createWindow();
    app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length)
            createWindow();
    });
});

app.on('second-instance', () => {
    if (win) {
        if (win.isMinimized())
            win.restore();
        win.focus();
    }
});

app.on('window-all-closed', () => {
    // En macOS la app sigue abierta sin ventanas, como el resto
    if (process.platform !== 'darwin')
        app.quit();
});
