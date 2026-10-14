#!/bin/sh
# Copia los bancos de muestras GM (datos de WebAudioFont, S. Surikov) a src/assets/sounds para servirlos
# desde nuestro propio servidor. Solo hace falta correrlo para agregar o actualizar bancos; los archivos
# ya estan en el repositorio. Uso: scripts/fetch-sounds.sh
set -e
BASE=https://surikov.github.io/webaudiofontdata/sound
OUT="$(dirname "$0")/../src/assets/sounds"
mkdir -p "$OUT"
LIST=$(mktemp)
for f in FluidR3_GM GeneralUserGS; do
  for p in $(seq 0 127); do printf '%03d0_%s_sf2_file.js\n' "$p" "$f"; done
done > "$LIST"
for k in 0 8 16 24 25; do
  for n in $(seq 35 81); do echo "128${n}_${k}_FluidR3_GM_sf2_file.js"; done
done >> "$LIST"
# 8 descargas en paralelo; los que ya existen no se vuelven a bajar
xargs -P 8 -I{} sh -c '[ -s "$1/{}" ] || curl -fsS --retry 3 -o "$1/{}" "$2/{}" || { echo "FALLO {}"; rm -f "$1/{}"; }' _ "$OUT" "$BASE" < "$LIST"
rm -f "$LIST"
echo "$(ls "$OUT"/*.js | wc -l) archivos, $(du -sh "$OUT" | cut -f1)"
