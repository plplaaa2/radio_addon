const port = 3005;
const atype_list = [256, 192, 128, 96, 48];
const atype_names = ["256k (고음질)", "192k (표준)", "128k (절약)", "96k (낮음)", "48k (터널용)"];
const mytoken = 'homeassistant'; 
const http = require('http');
const { URL } = require('url'); // WHATWG URL API 사용 
const child_process = require("child_process");
const fs = require('fs');
const axios = require('axios');

// 라디오 리스트 로드
const data = JSON.parse(fs.readFileSync('/app/radio-list.json', 'utf8'));
const instance = axios.create({ timeout: 5000 });

/**
 * FFmpeg를 이용한 스트림 파이핑 함수
 */
function return_pipe(urls, resp, req, refererUrl = "https://mini.imbc.com/") {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = new URL(req.url, `${protocol}://${req.headers.host}`);
    
    const atypeStr = fullUrl.searchParams.get("atype");
    const atype = atypeStr !== null ? Number(atypeStr) : 2;
    const bitrate = atype_list[atype] || 128;

    // FFmpeg 옵션 최적화: HLS 안정성 및 재연결 강화 
    const ffmpegArgs = [
        "-loglevel", "error",
        "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
        "-headers", `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\nReferer: ${refererUrl}\r\n`,
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", urls,
        "-c:a", "aac",
        "-b:a", `${bitrate}k`,
        "-ac", "2",
        "-ar", "44100",
        "-af", "aresample=async=1", 
        "-fflags", "+genpts+discardcorrupt",
        "-movflags", "frag_keyframe+empty_moov",
        "-f", "adts",
        "pipe:1"
    ];

    const xffmpeg = child_process.spawn("ffmpeg", ffmpegArgs);

// 응답 헤더 최적화
    resp.writeHead(200, { 
        'Content-Type': 'audio/aac', // 또는 'audio/x-aac'
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff' // 브라우저가 MIME 타입을 추측하지 않게 함
    });

    xffmpeg.stdout.pipe(resp);

    console.log(`[Radio] AAC Stream Started: ${bitrate}k (PID: ${xffmpeg.pid})`);

    // 디버그를 위한 STDERR 로그 출력 
    xffmpeg.stderr.on('data', (data) => {
        console.error(`[FFmpeg STDERR] PID ${xffmpeg.pid}: ${data}`);
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
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const fullUrl = new URL(req.url, `${protocol}://${req.headers.host}`);
    const pathname = fullUrl.pathname;
    const query = Object.fromEntries(fullUrl.searchParams);

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
                        const btns = document.querySelectorAll('.channel-btn');
                        btns.forEach(b => { if(b.innerText.toLowerCase() === key.toLowerCase()) b.classList.add('active'); });
                        
                        const atype = quality.value;
                        const streamUrl = "radio?token=${mytoken}&keys=" + key + "&atype=" + atype;
                        const qText = quality.options[quality.selectedIndex].text;
                        status.innerText = "재생 중: " + key.toUpperCase() + " [" + qText + "]";
                        audio.src = streamUrl;
                        audio.play().catch(e => console.error("Playback failed", e));
                    }
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
            console.log(`[Request] Channel: ${key} | Quality Index: ${query['atype'] || 2}`);

            if (myData === "kbs_lib") {
                getkbs(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (myData === "sbs_lib") {
                getsbs(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (myData === "mbc_lib") {
                getmbc(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (key === "wbsfm") {
                return_pipe(myData, resp, req, "https://wbsradio.kr/");
            } else if (key === "kfn") {
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
        const match = res.data.match(/(https?:\/\/[^\s"<>]+)/);
        if (match && match[1]) {
            return match[1].trim();
        }
        return res.data.includes('http') ? res.data.trim() : "invaild";
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

