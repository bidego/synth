'use strict';
const { contextBridge } = require('electron');
const { WEB_ORIGIN } = require('./lib');

// La web sabe que corre en el escritorio (los enlaces para compartir apuntan a la web publicada)
contextBridge.exposeInMainWorld('syntotecDesktop', {
    webOrigin: WEB_ORIGIN,
    platform: process.platform
});
