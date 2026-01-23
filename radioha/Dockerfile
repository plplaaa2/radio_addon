ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm ffmpeg tzdata

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.js radio-list.json ./

# S6 v3 방식: CMD 없이 특정 경로에 파일을 두면 시스템이 알아서 실행합니다.
RUN mkdir -p /etc/services.d/korea_radio
COPY run.sh /etc/services.d/korea_radio/run
RUN chmod a+x /etc/services.d/korea_radio/run
