# SyntotecApp

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 8.2.0.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `--prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).


## Bancos de sonido y creditos

Ademas de los sintetizadores, la app toca instrumentos de **muestras reales** (128 instrumentos General MIDI y kits de bateria).
Los datos estan **alojados en este repositorio** (`src/assets/sounds`, unos 58 MB) y los sirve la propia app: no dependen
de ningun servidor externo. Tienen el formato de [WebAudioFont](https://github.com/surikov/webaudiofont) (S. Surikov) y
`scripts/fetch-sounds.sh` los regenera o actualiza. Cada instrumento se descarga la primera vez que se elige y queda
guardado en el navegador (Cache Storage), asi que despues funciona sin conexion.

| Banco | Credito / licencia |
|---|---|
| FluidR3 GM (instrumentos y kits de bateria) | (c) 2000-2002, 2008 Frank Wen. Licencia estilo MIT; el aviso de copyright debe mantenerse en trabajos derivados. |
| GeneralUser GS (instrumentos) | S. Christian Collins. Su licencia (v2.0) permite usarlo en proyectos de software; el autor aclara que hereda los derechos de las muestras y que no puede garantizar su origen al 100 %. Ver https://www.schristiancollins.com/generaluser.php |

## Backend: los proyectos guardados van a un repositorio git

La app funciona sola, pero si hay un backend (`server/`), los proyectos que se **guardan con nombre** se envian ahi y
quedan versionados en un repositorio git: **el repositorio es la base de datos**. El servidor lo clona al arrancar,
carga todo en memoria (las lecturas no tocan git) y agrupa los cambios en commits (uno cada pocos segundos) que sube con
un token que vive **solo en el servidor** (variable `GIT_TOKEN`: nunca llega al navegador, a los logs ni a la
configuracion de git; se entrega a git por `GIT_ASKPASS`).

```
cp .env.example .env              # GIT_REPO_URL (conviene un repo PRIVADO) y GIT_TOKEN (solo contenido de ese repo)
docker compose --profile backend up --build
```

- nginx reenvia `/api` al backend (`API_UPSTREAM`). Sin backend la app sigue andando solo con el navegador.
- Cada navegador genera una **clave** al azar (64 hex, en `localStorage`); con ella se identifica ante el servidor. En el
  repo el dueno es un hash de la clave, asi que quien lea el repo no puede deducirla. Para ver los proyectos en otro
  navegador: *Proyecto > Servidor > Copiar clave* y en el otro *Usar otra clave*. Quien tenga la clave puede ver y
  cambiar esos proyectos.
- Sin conexion el proyecto queda guardado igual y se reenvia solo (con espera creciente); al arrancar la app trae los
  proyectos del servidor que falten y sube los que el servidor no tenga. Gana la version con fecha de guardado mas nueva.
- Archivos: `projects/<hash-del-dueno>/<id>.json`. Limites: 4 MB por proyecto, 200 por usuario, 120 pedidos/min por IP.
- Si se borra un proyecto en un navegador y otro navegador con la misma clave todavia lo tiene, ese lo vuelve a subir en
  su proxima sincronizacion (no hay marca de borrado compartida).
- El historial de git crece con cada version guardada: para un uso intenso conviene podar o archivar el repo de vez en cuando.
- Variables: ver `.env.example` y `server/server.js` (`COMMIT_DELAY_MS`, `PULL_INTERVAL_MS` para traer ediciones hechas a mano en el repo, etc.).
- Pruebas del backend (con un remoto git real): `cd server && node test.js`.

## Automatizacion

Con **Rec** activo y la casilla *Grabar automatizacion* del transporte (viene marcada), el movimiento de una perilla o fader
queda grabado en el loop y se repite en cada vuelta. Cada parametro tiene su pista en la linea de tiempo (curva azul), donde se
puede desactivar o borrar; el control se pinta de azul si esta automatizado y de rojo mientras graba. Mientras se sostiene el
control manda el usuario; al soltarlo vuelve la pista. Se guarda en el proyecto, se copia al duplicar un dispositivo y suena
tambien en el WAV exportado. Se pueden automatizar los parametros de **efectos y dinamicos**, el **mezclador** (faders, paneo,
envios aux, retornos, master), el **nivel de la salida** y el **volumen de cada pista** de un instrumento. Los parametros del
sintetizador (filtro, LFO...) todavia no: el sonido de una pista queda fijo al grabarla.

## Syntotec DAW (rack modular)

La aplicacion es un DAW tipo rack: un **host** con transporte global y un rack de **modulos** que se
conectan con **cables**. *Syntotec Synth Studio* (sintetizador + sampler + baterias + secuenciador) es uno
de esos modulos y se pueden poner varios.

**Transporte global:** play / stop / grabar, tempo (con tap), compas (numerador y denominador), largo del
loop (1 a 64 compases), cuantizacion, metronomo, cuenta previa y **transposicion general** en semitonos.

**Dispositivos:** Syntotec Synth Studio, Teclado / MIDI, Salida de audio, Mezclador de 8 canales (fader,
paneo, mute, solo y medidores), efectos (delay sincronizable al BPM, reverb, chorus, distorsion,
ecualizador de 3 bandas), dinamica (compresor, limitador) y patcheras (splitter 1>4, merger 4>1).

**Vistas:** *Rack* (el panel frontal de cada dispositivo) y *Cableado* (los dispositivos como nodos con
puertos; se arrastra de un puerto a otro para tender un cable). Los cables de audio unen nodos de WebAudio
reales; los de notas reenvian mensajes. No se permiten bucles ni unir tipos distintos. Tab alterna la vista.

**Estructura del codigo** (todo en este proyecto, en capas):

- `src/app/synth/` y `src/app/services/`: el motor del instrumento (voces, presets, sampler, bancos GM).
- `src/app/daw/core/`: `TransportService`, `RackGraph` (grafo puro, sin Angular), `RackService`,
  `Sequencer` (pistas por instrumento), `ProjectService` (guardado, migracion y export).
- `src/app/daw/modules/`: un archivo por tipo de dispositivo; se registran en `registry.ts`.
- `src/app/daw/ui/`: vistas Rack y Cableado y los paneles de cada dispositivo.

Los modulos no dependen de la pantalla ni del `AudioContext` en vivo: el **export a WAV reconstruye el rack
completo** (mismos dispositivos, ajustes y cables) sobre un `OfflineAudioContext`. Para agregar un
dispositivo: crear la clase (extiende `RackModule` o `EffectModule`), registrarla en `registry.ts` y,
si no es un efecto, darle su panel en `daw/ui`.

## Teclado, MIDI y proyectos

- Teclado de la compu (por posicion fisica): fila `Z X C V B N M , . /` y fila `Q W E R T Y U I O P`, con `S D G H J L ;` y `2 3 5 6 7 9 0` como teclas negras. `↑ ↓` cambian la octava, espacio = sustain. Estas teclas pasan por el modulo *Teclado / MIDI*, que las envia por cable a uno o mas instrumentos (capas).
- MIDI: cualquier controlador USB/Bluetooth (Web MIDI; Chrome/Edge, en `https` o `localhost`).
- Transporte: `Enter` play/stop, `` ` `` grabar en los instrumentos armados. Cada instrumento tiene su secuenciador (pistas, overdub, editor de notas con copia por Ctrl + arrastrar).
- Guardado: autoguardado en el navegador, proyectos con nombre, exportar/importar `.json` (version 2; los proyectos de la version anterior, de un solo instrumento, se migran solos) y exportar **WAV** del rack completo (16 bits, con efectos y mezcla).
