'use strict';
// Arma landing/demos/index.json (titulo, descripcion, estadisticas y miniatura) a partir de los proyectos de ejemplo
// landing/demos/<slug>.json. Las estadisticas y la miniatura se calculan igual que en la galeria publica del servidor.
// Uso: node scripts/build-demos.js
const fs = require('fs');
const path = require('path');
const { summarize, previewOf } = require('../server/publicdata');

const dir = path.join(__dirname, '..', 'landing', 'demos');
// Datos editoriales de cada proyecto de ejemplo (el audio del primero es landing/audio/intro.mp3)
const META = {
    'funkito-d': {
        title: 'Funkito D',
        author: 'Syntotec',
        description: 'Un groove funk de 16 compases a 104 BPM: bateria Power Kit y 808, bajo acustico y piano, con distorsion y delay automatizados.',
        audio: '/audio/intro.mp3'
    }
};

const items = Object.keys(META).map(slug => {
    const project = JSON.parse(fs.readFileSync(path.join(dir, slug + '.json'), 'utf8'));
    return Object.assign({ slug }, META[slug], { stats: summarize(project), preview: previewOf(project) });
});
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ items }));
console.log('landing/demos/index.json: ' + items.map(i => i.slug + ' (' + i.stats.notes + ' notas)').join(', '));
