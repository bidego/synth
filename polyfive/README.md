# Poly Five (plugin)

Un sintetizador **polifonico de 5 voces** con dos osciladores por voz, sync, poly-mod, filtro de escalera de 24 dB y dos envolventes ADSR, inspirado
en los clasicos polifonicos de los 70. Plugin **VST3 / AU / Standalone** y dispositivo del rack de Syntotec. Cuarto instrumento de la serie
(Juno 106, Model D, Acid Line): mismo esquema, motor en C++ puro + capa fina de JUCE.

```
engine/   motor de audio en C++ puro (sin JUCE)
tests/    pruebas del motor y comparacion con la version web
source/   plugin (JUCE): parametros, MIDI, sonidos, interfaz
presets/  los sonidos (JSON) -> scripts/gen_presets.py los vuelca al motor, scripts/gen_web.py a la web
tools/    PolyFiveSnapshot: captura PNG de la interfaz (para revisarla en el CI)
```

## Sonido

- **Oscilador A**: sierra y/o pulso con ancho variable; octava y afinacion fina. **Oscilador B**: sierra, triangulo y/o pulso; octava, frecuencia
  (+-12 semitonos), fino y ancho; con el interruptor *Low freq* se convierte en LFO, y *Keyboard* lo suelta del teclado.
- **Sync**: el oscilador A se reinicia con cada ciclo de B (el clasico sonido de lead sincronizado, mas filoso al barrer la frecuencia de A).
- **Poly-mod**: la envolvente del filtro y el oscilador B modulan, a eleccion, la frecuencia de A (FM y barridos), su ancho de pulso o el filtro.
  Es lo que da las campanas metalicas, los barridos de sync y los timbres que se mueven.
- **Mezclador** de A, B y ruido, y **filtro de escalera de 24 dB** con resonancia que autooscila, seguimiento de teclado (0, 1/2, completo) y
  una envolvente ADSR propia. Otra ADSR para el volumen.
- **LFO** (triangulo, sierra o cuadrada) y **ruido** como fuente de la rueda de modulacion, con destinos a elegir: frecuencia A y B, ancho de
  pulso A y B y filtro. La perilla *Initial amount* deja una cantidad fija aunque la rueda este abajo.
- **Unison** (las 5 voces juntas, levemente desafinadas) y **glide**. Cada voz tiene su propia deriva de afinacion, como los analogicos.
- Audio sobremuestreado 2 veces, ~5 % de un nucleo con 5 voces.

## Probar el motor (cualquier sistema, sin JUCE)

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target pf_tests
./build/pf_tests                # pruebas + medicion de rendimiento
./build/pf_tests --wav /tmp     # una progresion de acordes por cada sonido
node tests/compare_js.js ./build/pf_tests   # motor web vs motor del plugin (muestra a muestra)
```

## Compilar el plugin (macOS)

```
cmake -S . -B build -DPOLYFIVE_BUILD_PLUGIN=ON -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64" -DCMAKE_OSX_DEPLOYMENT_TARGET=10.13
cmake --build build --config Release
```

En GitHub: **Actions > Poly Five plugin (macOS)**. Una etiqueta `polyfive-test*` compila y valida (capturas de la interfaz e informes de `auval` y
`pluginval`); una etiqueta `polyfive-v*` ademas publica el release.

## Sonidos

`presets/pf-presets.json` es la unica fuente; `python3 scripts/gen_presets.py` regenera `engine/pf_presets.inc` y `python3 scripts/gen_web.py` los
datos de la web (`src/app/daw/modules/polyfive-data.ts` y el bloque de parametros de `src/assets/worklets/polyfive-worklet.js`). El volumen de cada
sonido se calibra con `./build/pf_tests --calibrate`.
