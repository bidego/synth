# Build stage (Angular 8 requires Node <= 12)
FROM node:12-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Sello de la compilacion (se muestra en la barra de estado): docker build --build-arg BUILD_COMMIT=$(git rev-parse --short HEAD) .
ARG BUILD_COMMIT=local
RUN printf "export const BUILD_COMMIT = '%s';\\nexport const BUILD_DATE = '%s';\\n" "$BUILD_COMMIT" "$(date -u '+%Y-%m-%d %H:%M UTC')" > src/app/build-info.ts
RUN npx ng build --prod --aot=false --build-optimizer=false

# Serve stage
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/syntotec-app /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
