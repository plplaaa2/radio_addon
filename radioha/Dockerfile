# 베이스 이미지
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 패키지 설치
RUN apk add --no-cache nodejs npm ffmpeg tzdata

# 작업 디렉토리
WORKDIR /app

# 패키지 및 소스 복사
COPY package.json ./
RUN npm install --production
COPY index.js radio-list.json ./

# [해결 핵심] S6 관리자를 우회하지 않고, 
# HA 애드온 시스템이 권장하는 방식으로 직접 실행합니다.
CMD [ "node", "/app/index.js" ]
