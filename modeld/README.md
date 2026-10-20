# Model D (plugin)

Un sintetizador **monofonico** de tres osciladores y filtro de escalera, inspirado en el Minimoog, como plugin **VST3 / AU / Standalone**
(proyecto paralelo al Juno 106 de `plugin/`; mismo esquema: motor en C++ puro + capa fina de JUCE).

```
engine/   motor de audio en C++ puro (sin JUCE)
tests/    pruebas del motor
source/   plugin (JUCE): parametros, MIDI, sonidos, interfaz
presets/  los sonidos (JSON) -> scripts/gen_presets.py los vuelca al motor
tools/    ModelDSnapshot: genera una captura PNG de la interfaz (para revisarla en el CI)
```

## Sonido

- **Tres osciladores** libres (como los analogicos, con una deriva de afinacion muy lenta): triangulo, diente de tiburon, sierra, cuadrada,
  pulso ancho y pulso angosto, en rangos LO / 32' / 16' / 8' / 4' / 2'. El oscilador 3 puede quedar libre del teclado y servir de LFO.
- **Mezclador** con ruido blanco o rosa y el "overload" del original: la suma satura la entrada del filtro.
- **Filtro de escalera de 24 dB/oct** con resonancia (autooscila hacia el final del recorrido) y saturacion en cada etapa, con seguimiento de
  teclado de 1/3, 2/3 o completo, y un contorno ADS.
- **Contorno de volumen** ADS; el interruptor Decay decide si la liberacion dura lo que el decaimiento o corta casi de golpe.
- **Modulacion**: el oscilador 3 (o el ruido) mueve el tono y/o el filtro; la cantidad la da la rueda de modulacion (o CC1).
- **Monofonico con ultima nota y legato**: tocar ligado no reinicia los contornos; al soltar la ultima vuelve a la anterior. Glide exponencial.
- **Calidad**: todo el camino de audio va sobremuestreado 4 veces y se decima con dos filtros FIR de fase lineal; PolyBLEP en los saltos.
- Extras que el original no tiene: sensibilidad a la velocidad (perilla VELOCITY; en 0 suena como el original).

## En Syntotec (web)

El mismo motor, traducido a JavaScript, corre como dispositivo del rack de Syntotec (`src/assets/worklets/modeld-worklet.js`, un
AudioWorklet; el modulo es `src/app/daw/modules/modeld.module.ts` y el panel `modeld-device.component.ts`). Los parametros y los sonidos
salen de los mismos datos: `python3 scripts/gen_web.py` regenera el bloque de parametros del worklet y `modeld-data.ts`.
`node tests/compare_js.js ./build/md_tests` compara el motor web con el del plugin muestra a muestra (error relativo < 0.03 %).

## Probar el motor (cualquier sistema, sin JUCE)

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target md_tests
./build/md_tests               # pruebas + medicion de rendimiento
./build/md_tests --wav /tmp    # un .wav por sonido para escuchar
```

## Compilar el plugin (macOS)

```
cmake -S . -B build -DMODELD_BUILD_PLUGIN=ON -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64" -DCMAKE_OSX_DEPLOYMENT_TARGET=10.13
cmake --build build --config Release
```

En GitHub: **Actions > Model D plugin (macOS)**. Una etiqueta `modeld-test*` compila y valida (con capturas de la interfaz y los informes de
`auval` y `pluginval`); una etiqueta `modeld-v*` ademas publica el release.

## Sonidos

`presets/md-presets.json` es la unica fuente; `python3 scripts/gen_presets.py` regenera `engine/md_presets.inc`. El volumen de cada sonido se
calibra con `./build/md_tests --calibrate` para que suenen parejos.
