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
Los datos **no estan en este repositorio**: se descargan desde [WebAudioFont](https://github.com/surikov/webaudiofont)
(S. Surikov, `surikov.github.io/webaudiofontdata`) la primera vez que se elige un instrumento y quedan guardados en el
navegador (Cache Storage), asi que despues funcionan sin conexion.

| Banco | Credito / licencia |
|---|---|
| FluidR3 GM (instrumentos y kits de bateria) | (c) 2000-2002, 2008 Frank Wen. Licencia estilo MIT; el aviso de copyright debe mantenerse en trabajos derivados. |
| GeneralUser GS (instrumentos) | S. Christian Collins. Revisar la licencia vigente en https://www.schristiancollins.com/generaluser.php antes de redistribuir. |

La app solo *lee* esos archivos desde su servidor original; si se decide copiarlos al repo o a un servidor propio,
hay que cumplir con las licencias de arriba.

## Teclado, MIDI y looper

- Teclado de la compu (por posicion fisica): fila `Z X C V B N M , . /` y fila `Q W E R T Y U I O P`, con `S D G H J L ;` y `2 3 5 6 7 9 0` como teclas negras. `↑ ↓` cambian la octava, espacio = sustain.
- MIDI: cualquier controlador USB/Bluetooth (Web MIDI; Chrome/Edge, en `https` o `localhost`).
- Looper multipista con overdub: `Enter` play/stop, `` ` `` grabar. Hasta 64 compases por loop.
- Guardado: autoguardado en el navegador, proyectos con nombre, exportar/importar `.json` y exportar **WAV** (render offline, 16 bits, con efectos).
