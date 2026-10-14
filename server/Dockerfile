FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /srv
COPY package.json server.js git.js store.js publicdata.js ./
# El repositorio de trabajo (clon del repo-base de datos) vive en /data: conviene montarlo como volumen
RUN mkdir /data && chown node:node /data
ENV DATA_DIR=/data PORT=3000
VOLUME /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
