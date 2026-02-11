const port = 3005;
const atype_list = [256, 192, 128, 96, 48];
const atype_names = ["256k (고음질)", "192k (표준)", "128k (절약)", "96k (낮음)", "48k (터널용)"];
const mytoken = 'homeassistant'; 
const http = require('http');
const { URL } = require('url'); // [추가] WHATWG URL API 
const child_process = require("child_process");
const fs = require('fs');
const axios = require('axios');

// 라디오 리스트 로드 
const data = JSON.parse(fs.readFileSync('/app/radio-list.json', 'utf8'));
const instance = axios.create({ timeout: 5000 });

function return_pipe(urls, resp, req, refererUrl = "https://mini.imbc.com/") {
    // 1. URL 파싱 방식 변경 (경고 해결 및 쿼리 추출) 
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = new URL(req.url, `${protocol}://${req.headers.host}`);
    
    const atypeStr = fullUrl.searchParams.get("atype");
    const atype = atypeStr !== null ? Number(atypeStr) : 2;
    const bitrate = atype_list[atype] || 128;

    // 2. FFmpeg 실행 옵션 최적화 (HLS 끊김 방지) 
    const ffmpegArgs = [
        "-loglevel", "error", 
        "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
        "-headers", `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\nReferer: ${refererUrl}\r\n`,
        "-reconnect", "1",           // [추가] 연결 끊김 시 재시도
        "-reconnect_streamed", "1",  // [추가] 스트림 재연결
        "-reconnect_delay_max", "5", // [추가] 최대 재연결 대기 시간
        "-i", urls,
        "-c:a", "aac",
        "-b:a", bitrate + "k",
        "-ac", "2",
        "-ar", "44100",
        "-af", "aresample=async=1",   // [추가] 오디오 싱크 밀림 방지
        "-fflags", "+genpts+discardcorrupt", // [추가] 손상된 패킷 무시 및 PTS 생성
        "-movflags", "frag_keyframe+empty_moov",
        "-f", "adts",
        "pipe:1"
    ];

    const xffmpeg = child_process.spawn("ffmpeg", ffmpegArgs);

    // 3. 응답 헤더 최적화 (연결 유지) 
    resp.writeHead(200, { 
        'Content-Type': 'audio/aac',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive' 
    });

    xffmpeg.stdout.pipe(resp);

    console.log(`[Radio] AAC Stream Started: ${bitrate}k (PID: ${xffmpeg.pid})`);

    // FFmpeg 에러 로그 캡처
    xffmpeg.stderr.on('data', (data) => {
        console.error(`[FFmpeg STDERR] ${data}`);
    });

    req.on("close", () => {
        if (xffmpeg) {
            console.log(`[Radio] Connection Closed (PID: ${xffmpeg.pid})`);
            xffmpeg.kill('SIGKILL'); 
        }
    });

    xffmpeg.on("error", (e) => console.error(`[FFmpeg Error] ${e}`));
}

const liveServer = http.createServer((req, resp) => {
    // URL 분석 방식 통일 
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = new URL(req.url, `${protocol}://${req.headers.host}`);
    const pathname = fullUrl.pathname;
    const query = Object.fromEntries(fullUrl.searchParams);

    // --- 이후 HTML 렌더링 및 방송사 파싱 로직은 기존과 동일하게 유지 ---

    // 1. Web UI 메인 화면
    if (pathname === "/") {
        resp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        const channelButtons = Object.keys(data).map(key => 
            `<button class="channel-btn" onclick="play('${key}')">${key.toUpperCase()}</button>`
        ).join('');

        resp.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Korea Radio Web Player</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; 
                           background-color: #1a1a1a; color: white; display: flex; flex-direction: column; align-items: center; padding: 20px; }
                    .container { max-width: 500px; width: 100%; text-align: center; }
                    h2 { color: #03a9f4; margin-bottom: 20px; }
                    
                    /* 음질 선택 섹션 */
                    .settings-box { background: #222; padding: 12px; border-radius: 10px; margin-bottom: 15px; width: 100%; box-sizing: border-box; text-align: left; }
                    .settings-label { font-size: 0.8em; color: #888; margin-bottom: 8px; display: block; }
                    select { width: 100%; padding: 10px; background: #333; color: white; border: 1px solid #444; border-radius: 6px; font-size: 0.95rem; cursor: pointer; box-sizing: border-box; }
                    
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 30px; width: 100%; }
                    .channel-btn { background: #333; border: 1px solid #444; color: white; padding: 15px 5px; 
                                   border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; font-size: 0.9rem;}
                    .channel-btn:hover { background: #03a9f4; border-color: #03a9f4; }
                    .channel-btn.active { background: #ff9800; border-color: #ff9800; }
                    
                    .player-box { background: #222; padding: 20px; border-radius: 15px; position: sticky; bottom: 20px; width: 100%; box-shadow: 0 -5px 15px rgba(0,0,0,0.5); box-sizing: border-box; }
                    audio { width: 100%; margin-top: 10px; }
                    #status { font-size: 0.85em; color: #aaa; margin-bottom: 5px; height: 1.2em; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>📻 Korea Radio Player</h2>
                    
                    <div class="settings-box">
                        <span class="settings-label">스트리밍 음질 선택</span>
                        <select id="quality">
                            ${atype_names.map((name, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>

                    <div class="grid">${channelButtons}</div>
                </div>

                <div class="player-box">
                    <div id="status">채널을 선택하세요</div>
                    <audio id="audio" controls autoplay></audio>
                </div>

                <script>
                    const audio = document.getElementById('audio');
                    const status = document.getElementById('status');
                    const quality = document.getElementById('quality');
                    let currentKey = '';

                    function play(key) {
                        currentKey = key;
                        document.querySelectorAll('.channel-btn').forEach(btn => btn.classList.remove('active'));
                        
                        // 클릭된 버튼 강조 (이벤트 타겟이 버튼일 경우)
                        if(event && event.target.classList.contains('channel-btn')) {
                            event.target.classList.add('active');
                        } else {
                            // 음질 변경 등으로 자동 재호출 시 버튼 활성화 유지
                            const btns = document.querySelectorAll('.channel-btn');
                            btns.forEach(b => { if(b.innerText.toLowerCase() === key.toLowerCase()) b.classList.add('active'); });
                        }
                        
                        const atype = quality.value;
                        const streamUrl = "radio?token=${mytoken}&keys=" + key + "&atype=" + atype;
                        
                        const qText = quality.options[quality.selectedIndex].text;
                        status.innerText = "재생 중: " + key.toUpperCase() + " [" + qText + "]";
                        audio.src = streamUrl;
                        audio.play();
                    }

                    // 음질 변경 시 즉시 재접속
                    quality.onchange = () => { if(currentKey) play(currentKey); };
                </script>
            </body>
            </html>
        `);
        return;
    }

    // 2. 라디오 스트리밍 로직
    if (pathname === "/radio" && query['token'] === mytoken) {
        const key = query['keys'];
        if (key && data[key]) {
            const myData = data[key];
            console.log(`[Request] Channel: ${key} | Quality Index: ${query['atype'] || 0}`);

            if (myData === "kbs_lib") {
                getkbs(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (myData === "sbs_lib") {
                getsbs(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (myData === "mbc_lib") {
                getmbc(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (key === "wbsfm") {
            // WBS 전용 리퍼러 적용
                return_pipe(myData, resp, req, "https://wbsradio.kr/");
            } else if (key === "kfn") {
            // KFN 전용 리퍼러 적용
                return_pipe(myData, resp, req, "https://radio.kfn.miracom.pro/");
            } else {
                return_pipe(myData, resp, req);
            }
        } else {
            errorOut(resp, "Invalid Key");
        }
    } else {
        errorOut(resp, "Unauthorized");
    }
});

function errorOut(resp, msg = "Error") {
    resp.statusCode = 403;
    resp.setHeader('Content-Type', 'text/plain; charset=utf-8');
    resp.end(msg);
}

// --- 방송사 파서 함수들 ---
async function getkbs(param) {
    const kbs_ch = { 'kbs_1radio': '21', 'kbs_3radio': '23', 'kbs_classic': '24', 'kbs_cool': '25', 'kbs_happy': '22' };
    try {
        const res = await instance.get(`https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/${kbs_ch[param]}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://onair.kbs.co.kr/' }
        });
        return res.data.channel_item.find(i => i.media_type === 'radio').service_url;
    } catch { return "invaild"; }
}

async function getmbc(ch) {
    const mbc_ch = { 'mbc_fm4u': 'mfm', 'mbc_fm': 'sfm' };
    try {
        const res = await instance.get(`https://sminiplay.imbc.com/aacplay.ashx?agent=webapp&channel=${mbc_ch[ch]}`, {
            headers: {
                'Referer': 'https://mini.imbc.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // 로그를 보니 따옴표 없이 주소만 오거나, 주소 뒤에 다른 텍스트가 붙어 있을 수 있습니다.
        // http 또는 https로 시작하는 모든 연속된 문자열을 가져옵니다.
        const match = res.data.match(/(https?:\/\/[^\s"<>]+)/);
        
        if (match && match[1]) {
            // 주소 끝에 불필요한 공백이나 문자가 붙는 것 방지
            const streamUrl = match[1].trim();
            console.log(`[MBC] Success! Found URL: ${streamUrl}`);
            return streamUrl;
        } else {
            // 만약 정규식으로도 실패하면, 데이터 전체가 주소일 가능성이 크므로 그대로 반환 시도
            if (res.data.includes('http')) {
                const rawUrl = res.data.trim();
                console.log(`[MBC] Direct URL mapping: ${rawUrl}`);
                return rawUrl;
            }
            console.error(`[MBC] Really Failed. Data: ${res.data}`);
            return "invaild";
        }
    } catch (e) { 
        console.error(`[MBC Error] ${e.message}`);
        return "invaild"; 
    }
}

async function getsbs(ch) {
    const sbs_ch = { 'sbs_power': ['powerfm', 'powerpc'], 'sbs_love': ['lovefm', 'lovepc'] };
    try {
        const res = await instance.get(`https://apis.sbs.co.kr/play-api/1.0/livestream/${sbs_ch[ch][1]}/${sbs_ch[ch][0]}?protocol=hls&ssl=Y`);
        return res.data;
    } catch { return "invaild"; }
}

liveServer.listen(port, '0.0.0.0', () => console.log(`Korea Radio Server running on port ${port}`));












