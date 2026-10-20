# Juno 106 (plugin)

El Juno-106 de Syntotec como plugin de verdad: **VST3**, **AU** (Logic, GarageBand) y **Standalone**. Es un proyecto paralelo a la web:
reescribe el motor de audio en C++ con [JUCE](https://juce.com) (la web no puede ser un plugin).

```
engine/   motor de audio en C++ puro (sin JUCE): DCO, filtros, envolventes, LFO, chorus, voces
tests/    pruebas del motor (altura, niveles, liberacion, filtro, velocidad, modos, estabilidad)
source/   la capa de plugin (JUCE): parametros, MIDI, sonidos, estado
```

Los ids de los controles son los mismos que los de la version web (`vcfFreq`, `atk`, `chorus`...), y los sonidos de partida son los mismos.

## Que trae

Seis voces. Por voz: DCO con sierra, pulso con PWM (a mano o por LFO) y sub, ruido, pasa altos de 4 posiciones, filtro de 24 dB
(escalera de 4 polos que autooscila con la resonancia al maximo), VCA con envolvente o gate, un ADSR para el filtro y el VCA.
Global: LFO triangular con retardo, chorus I / II / I+II estereo, portamento, bender, rueda de modulacion (CC1), pedal de sustain (CC64),
Poly 1 / Poly 2 / Unison y sensibilidad a la velocidad (un agregado: en 0 suena como el original).
Los osciladores usan PolyBLEP contra el aliasing.

Todo es parametro del plugin: se automatiza desde la DAW y el MIDI Learn lo hace la propia DAW. Los 37 sonidos de partida son los
"programas" del plugin. La interfaz es un panel propio al estilo del Juno-106 (deslizadores 0-10, LEDs de voces, selector de sonidos, bender, rueda y teclado en pantalla); `JunoSnapshot` genera capturas de ella en el CI.

## Probar el motor (cualquier sistema, sin JUCE)

```
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target juno_tests
./build/juno_tests                 # pruebas + medicion de rendimiento
./build/juno_tests --wav /tmp      # ademas deja un .wav por sonido para escuchar
```

## Compilar el plugin (macOS)

```
cmake -S . -B build -DJUNO_BUILD_PLUGIN=ON -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64" -DCMAKE_OSX_DEPLOYMENT_TARGET=10.13
cmake --build build --config Release
```

JUCE se baja solo. Los resultados quedan en `build/Juno106_artefacts/Release/` (`VST3/`, `AU/`, `Standalone/`).

Tambien lo compila GitHub: **Actions > Juno 106 plugin (macOS) > Run workflow** (o subiendo una etiqueta `plugin-v*`);
el artefacto `juno106-macos` trae los tres formatos en .zip, para Intel y Apple Silicon.

## Instalar

| Formato | Carpeta |
|---|---|
| VST3 | `~/Library/Audio/Plug-Ins/VST3/` |
| AU | `~/Library/Audio/Plug-Ins/Components/` |
| Standalone | donde quieras (es una app) |

Los plugins van firmados "ad hoc", sin cuenta de Apple Developer. Si macOS los bloquea al bajarlos:
`xattr -cr "Juno 106.vst3"` (idem `.component` y `.app`). Para el AU en Logic: reiniciar Logic (valida al abrir);
a mano: `auval -v aumu Jn06 Synt`.

## Pendiente

- Windows y Linux en el CI (el codigo ya compila ahi; falta el workflow).
- AAX (Pro Tools): requiere el SDK y la cuenta de desarrollador de Avid. RTAS ya no existe.
- Firmar y notarizar con una cuenta de Apple Developer.
