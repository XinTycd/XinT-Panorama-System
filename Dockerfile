FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY frontend ./frontend
COPY lib ./lib
COPY scripts ./scripts
COPY config.json ./config.json

ENV PANORAMA_HOST=0.0.0.0
ENV FRONTEND_HOST=0.0.0.0
ENV PANORAMA_STORAGE_DIR=/data

EXPOSE 7210 7211
CMD ["npm", "start"]
