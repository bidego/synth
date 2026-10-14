#!/bin/sh
# Arranca nginx (la web) y, si hay GIT_REPO_URL, el backend de proyectos en el mismo contenedor.
# Sin GIT_REPO_URL el backend no se inicia y la app funciona igual, solo con el navegador.

backend() {
  while :; do
    # El puerto y la direccion se fijan aca: algunas plataformas inyectan PORT para la web y no debe afectar al backend
    su-exec syntotec env PORT=3000 HOST=127.0.0.1 node /srv/server.js &
    child=$!
    trap 'kill -TERM $child 2>/dev/null; wait $child; exit 0' TERM INT QUIT
    wait $child
    echo "[start] el backend termino; reintento en 10 s" >&2
    sleep 10 &
    wait $!
  done
}

backend_pid=""
if [ -n "$GIT_REPO_URL" ]; then
  echo "[start] iniciando el backend de proyectos"
  backend &
  backend_pid=$!
else
  echo "[start] sin GIT_REPO_URL: el backend de proyectos no se inicia"
fi

# Pasa por el entrypoint oficial de nginx: es el que completa las plantillas de configuracion (solo lo hace si el comando es `nginx`)
/docker-entrypoint.sh nginx -g 'daemon off;' &
nginx_pid=$!

# Al apagar: el backend versiona lo pendiente en git antes de salir, y despues nginx
stop() {
  [ -n "$backend_pid" ] && kill -TERM "$backend_pid" 2>/dev/null && wait "$backend_pid" 2>/dev/null
  kill -QUIT "$nginx_pid" 2>/dev/null
}
# docker stop manda SIGQUIT (asi lo declara la imagen de nginx): tambien se atiende, o el contenedor tarda en parar y lo matan sin versionar
trap stop TERM INT QUIT
wait "$nginx_pid"
status=$?
[ -n "$backend_pid" ] && kill -TERM "$backend_pid" 2>/dev/null
exit $status
