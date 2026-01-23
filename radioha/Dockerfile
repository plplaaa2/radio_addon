# 1. HA 공식 베이스 이미지 사용
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# 2. 필수 패키지 설치
RUN apk add --no-cache \
    nodejs \
    npm \
    ffmpeg \
    tzdata

# 3. 작업 디렉토리 및 파일 복사
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.js radio-list.json run.sh ./

# 4. 실행 권한 부여
RUN chmod a+x /app/run.sh

# 5. [중요] ENTRYPOINT를 절대 사용하지 마세요. 
# 대신 CMD를 사용하여 run.sh를 호출합니다.
CMD [ "/app/run.sh" ]
