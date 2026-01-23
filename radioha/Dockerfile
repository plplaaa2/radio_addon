ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 1. 패키지 설치
RUN apk add --no-cache nodejs npm ffmpeg tzdata

# 2. 앱 설정
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.js radio-list.json ./

# 3. [HAOS 17 최종 해결] S6-RC 서비스 유닛 생성
# 서비스를 정의하는 폴더를 만듭니다.
RUN mkdir -p /etc/s6-overlay/s6-rc.d/radioha

# 실행 스크립트 복사 및 권한 부여
COPY run.sh /etc/s6-overlay/s6-rc.d/radioha/run
RUN chmod a+x /etc/s6-overlay/s6-rc.d/radioha/run

# 서비스 타입 정의 (계속 실행되는 서비스이므로 longrun)
RUN echo "longrun" > /etc/s6-overlay/s6-rc.d/radioha/type

# 서비스 종속성 및 활성화 설정
RUN mkdir -p /etc/s6-overlay/s6-rc.d/user/contents.d
RUN touch /etc/s6-overlay/s6-rc.d/user/contents.d/radioha

# 마지막에 CMD나 ENTRYPOINT는 절대로 넣지 마세요.
