# Build stage (Angular 8 requires Node <= 12)
FROM node:12-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Sello de la compilacion (se muestra en la barra de estado): docker build --build-arg BUILD_COMMIT=$(git rev-parse --short HEAD) .
ARG BUILD_COMMIT=local
RUN printf "export const BUILD_COMMIT = '%s';\\nexport const BUILD_DATE = '%s';\\n" "$BUILD_COMMIT" "$(date -u '+%Y-%m-%d %H:%M UTC')" > src/app/build-info.ts
# La app se sirve en /app/ (la raiz es la landing)
RUN npx ng build --prod --aot=false --build-optimizer=false --base-href /app/

# Serve stage: nginx (la web) y, opcionalmente, el backend de proyectos en el mismo contenedor
FROM nginx:alpine
RUN apk add --no-cache nodejs git su-exec \
    && adduser -D -u 10001 syntotec \
    && mkdir /data && chown syntotec:syntotec /data
# nginx.conf es una plantilla: el contenedor reemplaza ${API_UPSTREAM} y ${NGINX_RESOLVER} al arrancar
COPY nginx.conf /etc/nginx/templates/default.conf.template
# Por defecto /api va al backend de este mismo contenedor (en un despliegue con backend aparte: API_UPSTREAM)
ENV API_UPSTREAM=http://127.0.0.1:3000 NGINX_RESOLVER=127.0.0.11 DATA_DIR=/data
COPY server/package.json server/server.js server/git.js server/store.js server/publicdata.js /srv/
COPY deploy/start.sh /start.sh
COPY landing/ /usr/share/nginx/html/
COPY --from=build /app/dist/syntotec-app /usr/share/nginx/html/app
# Version de la compilacion en los archivos de la landing (?v=...): evita mezclar un JS/CSS viejo en cache con el HTML nuevo
ARG BUILD_COMMIT=local
RUN V="${BUILD_COMMIT}-$(date +%s)" && sed -i "s/__V__/$V/g" /usr/share/nginx/html/index.html
EXPOSE 80
CMD ["/start.sh"]
