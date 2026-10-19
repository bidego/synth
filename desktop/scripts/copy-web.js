'use strict';
// Copia la web compilada (ng build --base-href /app/) a desktop/app, que es lo que se empaqueta
const fs = require('fs');
const path = require('path');

const from = process.env.WEB_DIST || path.join(__dirname, '..', '..', 'dist', 'syntotec-app');
const to = path.join(__dirname, '..', 'app');
if (!fs.existsSync(path.join(from, 'index.html'))) {
    console.error('No hay web compilada en ' + from + '. Compilala primero:\n  npx ng build --prod --aot=false --build-optimizer=false --base-href /app/');
    process.exit(1);
}
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
const html = fs.readFileSync(path.join(to, 'index.html'), 'utf8');
if (html.indexOf('<base href="/app/">') < 0) {
    console.error('La web se compilo con otro base-href: tiene que ser /app/');
    process.exit(1);
}
console.log('Web copiada a ' + to);
