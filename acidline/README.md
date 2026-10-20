# Acid Line (plugin)

Un bajo **monofonico de linea acida** (un oscilador, filtro resonante de 18 dB, barrido de decaimiento, acento y slide), inspirado en los
bajos secuenciados de los 80, como plugin **VST3 / AU / Standalone** y como dispositivo del rack de Syntotec. Tercer instrumento de la
serie (despues del Juno 106 y el Model D): mismo esquema, motor en C++ puro + capa fina de JUCE.

```
engine/   motor de audio en C++ puro (sin JUCE)
tests/    pruebas del motor y comparacion con la version web
source/   plugin (JUCE): parametros, MIDI, sonidos, interfaz
presets/  los sonidos (JSON) -> scripts/gen_presets.py los vuelca al motor, scripts/gen_web.py a la web
tools/    AcidSnapshot: captura PNG de la interfaz (para revisarla en el CI)
```

## Sonido

- **Oscilador** de sierra o cuadrada (PolyBLEP, sin aliasing audible), con una deriva de afinacion muy lenta.
- **Filtro de escalera de 4 polos con la salida en el 3ro (18 dB/oct)**, saturacion en cada etapa y resonancia que le saca graves a medida que
  sube, como el original. El barrido (Env Mod) es un decaimiento exponencial de 0.2 a 2.5 s.
- **Acento**: una nota con velocidad por encima del umbral (perilla Velocity Threshold) sube el volumen, profundiza el barrido, acorta el
  decaimiento y empuja la resonancia. El LED del panel se enciende con cada nota acentuada.
- **Slide**: una nota que empieza mientras la anterior sigue apretada (legato) se desliza a la nueva altura en un tiempo corto y **no
  reinicia el barrido**; una nota nueva despues de soltar salta directo.
- **Overdrive** a la salida (Drive) para los ensuciados clasicos.
- Todo el camino de audio va sobremuestreado 4 veces. Usa ~3 % de un nucleo.

En un secuenciador o en una pista de la DAW: velocidad alta = acento; notas que se pisan = slide.

## Probar el motor (cualquier sistema, sin JUCE)

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target ac_tests
./build/ac_tests                # pruebas + medicion de rendimiento
./build/ac_tests --wav /tmp     # un patron de 16 pasos con acentos y slides por cada sonido
node tests/compare_js.js ./build/ac_tests   # motor web vs motor del plugin (muestra a muestra)
```

## Compilar el plugin (macOS)

```
cmake -S . -B build -DACIDLINE_BUILD_PLUGIN=ON -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64" -DCMAKE_OSX_DEPLOYMENT_TARGET=10.13
cmake --build build --config Release
```

En GitHub: **Actions > Acid Line plugin (macOS)**. Una etiqueta `acidline-test*` compila y valida (capturas de la interfaz e informes de `auval` y
`pluginval`); una etiqueta `acidline-v*` ademas publica el release.

## Sonidos

`presets/ac-presets.json` es la unica fuente; `python3 scripts/gen_presets.py` regenera `engine/ac_presets.inc` y `python3 scripts/gen_web.py` los
datos de la web (`src/app/daw/modules/acid-data.ts` y el bloque de parametros de `src/assets/worklets/acid-worklet.js`). El volumen de cada sonido
se calibra con `./build/ac_tests --calibrate`.
