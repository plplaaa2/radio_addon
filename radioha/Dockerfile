# 1. Home Assistant 전용 베이스 이미지 사용 (가볍고 호환성 좋음)
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 2. 필요한 패키지 설치 (Alpine 방식인 apk 사용)
# Node.js와 ffmpeg를 설치합니다.
RUN apk add --no-cache \
    nodejs \
    npm \
    ffmpeg

# 3. 작업 디렉토리 설정
WORKDIR /app

# 4. 파일 복사 및 권한 설정
COPY index.js package.json radio-list.json run.sh /app/
RUN chmod a+x /app/run.sh

# 5. 의존성 설치
RUN npm install

# 6. 실행
ENTRYPOINT [ "/app/run.sh" ]
