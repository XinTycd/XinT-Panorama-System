FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:vendor

FROM node:24-alpine AS runtime

WORKDIR /app
COPY . .
COPY --from=build /app/frontend/vendor/psv.bundle.js ./frontend/vendor/psv.bundle.js
COPY --from=build /app/frontend/vendor/psv.css ./frontend/vendor/psv.css
COPY --from=build /app/frontend/vendor/PSV-LICENSE ./frontend/vendor/PSV-LICENSE
COPY --from=build /app/frontend/vendor/THREE-LICENSE ./frontend/vendor/THREE-LICENSE
COPY --from=build /app/frontend/vendor/THIRD_PARTY_NOTICES.txt ./frontend/vendor/THIRD_PARTY_NOTICES.txt
COPY --from=build /app/frontend/vendor/.psv-build-manifest.json ./frontend/vendor/.psv-build-manifest.json
RUN npm ci --omit=dev

ENV PANORAMA_HOST=0.0.0.0
ENV FRONTEND_HOST=0.0.0.0
ENV PANORAMA_STORAGE_DIR=/data

EXPOSE 7210 7211

CMD ["npm", "start"]
