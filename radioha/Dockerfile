ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 필수 패키지 설치
RUN apk add --no-cache nodejs npm ffmpeg tzdata

# 앱 작업 폴더 생성
WORKDIR /app

# 의존성 설치 (package.json이 준비되면 실행됨)
COPY package.json ./
RUN npm install --production

# 소스 복사 (라디오 리스트와 메인 코드)
COPY index.js radio-list.json ./

# [중요] HAOS 17의 S6 관리자가 실행할 수 있도록 서비스 등록
COPY run.sh /etc/services.d/korea_radio/run
RUN chmod a+x /etc/services.d/korea_radio/run
