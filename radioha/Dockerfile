ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 1. 필수 패키지 설치
RUN apk add --no-cache nodejs npm ffmpeg tzdata

# 2. 앱 디렉토리 설정 및 빌드
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.js radio-list.json ./

# 3. [HAOS 17 대응 최종병기] S6-Overlay v3 서비스 폴더 강제 생성
# 폴더를 미리 만들고 그 안에 run 파일을 복사해야 합니다.
RUN mkdir -p /etc/s6-overlay/s6-rc.d/radioha
COPY run.sh /etc/s6-overlay/s6-rc.d/radioha/run
RUN chmod a+x /etc/s6-overlay/s6-rc.d/radioha/run

# S6-Overlay v3는 'type' 파일이 있어야 서비스로 인식합니다.
RUN echo "longrun" > /etc/s6-overlay/s6-rc.d/radioha/type
# 서비스를 활성화하기 위해 up 파일 생성
RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/radioha

# 마지막에 CMD나 ENTRYPOINT를 모두 삭제하세요.
