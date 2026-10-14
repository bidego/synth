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
