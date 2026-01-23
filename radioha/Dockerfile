ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 1. 패키지 설치
RUN apk add --no-cache nodejs npm ffmpeg tzdata

# 2. 작업 디렉토리 설정
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.js radio-list.json ./

# 3. [핵심] S6-Overlay v3 전용 실행 스크립트 배치
# HAOS 17 환경에서 S6가 직접 관리하는 위치로 실행 파일을 옮깁니다.
COPY run.sh /etc/services.d/radioha/run
RUN chmod a+x /etc/services.d/radioha/run

# 4. [중요] CMD와 ENTRYPOINT를 모두 삭제하거나 비워둡니다.
# 이렇게 하면 S6가 /etc/services.d/ 아래의 스크립트를 자동으로 PID 1 하위에서 실행합니다.
