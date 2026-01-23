# 2026년 기준 가장 안정적인 HA 공식 베이스 이미지
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 필요한 시스템 패키지 설치
RUN apk add --no-cache \
    nodejs \
    npm \
    ffmpeg \
    tzdata

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 설치 (빌드 속도를 위해 layer 캐싱 활용)
COPY package.json ./
RUN npm install --production

# 소스 코드 및 필수 파일 복사
COPY index.js radio-list.json run.sh ./
RUN chmod a+x /app/run.sh

# 실행 (HA 애드온 표준은 ENTRYPOINT 대신 CMD를 선호하기도 함)
CMD [ "/app/run.sh" ]
