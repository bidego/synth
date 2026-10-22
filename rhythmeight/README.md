# Rhythm Eight (plugin)

Una **caja de ritmos analogica de 13 voces** con secuenciador de 16 pasos, inspirada en las clasicas de los 80. Plugin **VST3 / AU / Standalone** y
dispositivo del rack de Syntotec. Quinto instrumento de la serie (Juno 106, Model D, Acid Line, Poly Five): mismo esquema, motor en C++ puro +
capa fina de JUCE.

```
engine/   motor de audio en C++ puro (sin JUCE)
tests/    pruebas del motor y comparacion con la version web
source/   plugin (JUCE): parametros, MIDI, sonidos, patron e interfaz
presets/  los sonidos (JSON) -> scripts/gen_presets.py los vuelca al motor, scripts/gen_web.py a la web
tools/    RhythmEightSnapshot: captura PNG de la interfaz (para revisarla en el CI)
```

## Voces

Cada voz es una sintesis propia, como los circuitos de los originales. Perillas por voz:

| Voz | Perillas | Nota MIDI (GM) |
|---|---|---|
| BD Bass Drum (bombo con barrido de tono) | Level, Tune, Decay, Tone | 36 |
| SD Snare (caja de dos tonos y ruido) | Level, Tune, Tone, Snappy | 38 |
| LT Low Tom | Level, Tune, Decay | 41 |
| MT Mid Tom | Level, Tune, Decay | 45 |
| HT Hi Tom | Level, Tune, Decay | 48 |
| RS Rim Shot | Level | 37 |
| CL Claves | Level | 75 |
| CP Hand Clap (rafagas de ruido) | Level | 39 |
| MA Maracas | Level | 70 |
| CB Cowbell (dos cuadradas) | Level, Tune | 56 |
| CY Cymbal (seis cuadradas) | Level, Tone, Decay | 49 |
| OH Open Hat | Level, Decay | 46 |
| CH Closed Hat (corta al open hat) | Level | 42 |

Tambien suenan algunas notas vecinas (35, 40, 43, 47, 50, 51, 44, 69...; ver `noteToInst` en `engine/re_params.cpp`). La velocidad MIDI se respeta.
Las voces tambien se tocan con un clic sobre el rotulo de la fila en la interfaz.

## Secuenciador

- **13 filas x 16 pasos**. Cada paso es vacio, golpe o **acento**; un clic recorre vacio -> golpe -> acento -> vacio y arrastrar pinta. Los botones se
  agrupan de a cuatro (rojo, naranja, amarillo y crema) como en el panel clasico; el acento se ve mas brillante y suena mas fuerte (perilla *Accent*).
- **Steps**: largo del patron (16, 12, 8 o 4 pasos). **Shuffle**: retrasa los pasos pares. **Tempo**: 40 a 240 BPM.
- **Sync = Internal**: marcha con el boton RUN/STOP y el tempo propio. **Sync = Host**: sigue el transporte del anfitrion (posicion y BPM).
- El patron se guarda con el estado del proyecto y cada sonido trae el suyo; los sonidos son los programas del plugin (anterior / siguiente en la barra).

## Probar el motor (cualquier sistema, sin JUCE)

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target re_tests
./build/re_tests                # pruebas + medicion de rendimiento
./build/re_tests --wav /tmp     # un compas de cada sonido
node tests/compare_js.js ./build/re_tests   # motor web vs motor del plugin (muestra a muestra)
```

## Compilar el plugin (macOS)

```
cmake -S . -B build -DRHYTHMEIGHT_BUILD_PLUGIN=ON -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64" -DCMAKE_OSX_DEPLOYMENT_TARGET=10.13
cmake --build build --config Release
```

En GitHub: **Actions > Rhythm Eight plugin (macOS)**. Una etiqueta `rhythmeight-test*` compila y valida (capturas de la interfaz e informes de `auval` y
`pluginval`); una etiqueta `rhythmeight-v*` ademas publica el release. Para ver la interfaz: `RhythmEightSnapshot salida.png [indice del sonido]`.

## Sonidos

`presets/re-presets.json` es la unica fuente; `python3 scripts/gen_presets.py` regenera `engine/re_presets.inc` y `python3 scripts/gen_web.py` los
datos de la web (`src/app/daw/modules/rhythmeight-data.ts` y el bloque de parametros de `src/assets/worklets/rhythmeight-worklet.js`).
