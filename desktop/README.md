# Syntotec para macOS

La web de Syntotec empaquetada con Electron: misma app, en su propia ventana, con el audio y el MIDI de Chromium.
Corre local (tocar y grabar andan sin internet); las llamadas `/api` (proyectos guardados, enlaces cortos,
galeria) van a https://synth.zondacloud.com.

## Instalar (el .dmg que sale de GitHub Actions)

1. En GitHub: **Actions > Syntotec para macOS > Run workflow**. Al terminar, bajar el artefacto `syntotec-macos`.
2. Abrir el `.dmg` y arrastrar Syntotec a Aplicaciones (`arm64` = Mac con chip Apple, `x64` = Mac con Intel).
3. La app no esta firmada: la primera vez, **clic derecho > Abrir** (o Ajustes del Sistema > Privacidad y seguridad > "Abrir de todos modos").
   Si dice que esta danada: `xattr -cr /Applications/Syntotec.app`.

## Correrla desde el codigo

```
# en la raiz: compilar la web para /app/ (Angular 8 pide Node <= 12)
npx ng build --prod --aot=false --build-optimizer=false --base-href /app/
cd desktop
npm install
npm run web      # copia la web compilada a desktop/app
npm start
```

`npm run dist:mac` arma el `.dmg` y el `.zip` (el `.dmg` solo se puede armar en una Mac).

## Como funciona

- `main.js` sirve la web por un esquema propio (`syntotec://synth/app/`), con las mismas rutas que nginx: `/app/...` son los archivos
  compilados, `/` redirige a `/app/` y `/api/...` se reenvia al servidor publicado (sin conexion responde como nginx sin backend).
- `preload.js` avisa a la web que corre en el escritorio: los enlaces para compartir apuntan a la web publicada.
- Se conceden los permisos que la app usa: MIDI, pantalla completa y la **entrada de audio** (placa de sonido, para el dispositivo "Entrada de audio"
  y el grabador); la camara y la ubicacion se deniegan. En macOS la primera vez el sistema pide autorizar el microfono (si se dijo que no:
  Ajustes del Sistema > Privacidad y seguridad > Microfono). Los enlaces externos se abren en el navegador.
