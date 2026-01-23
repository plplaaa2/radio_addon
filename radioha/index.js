const port = 3005;
const atype_list = [256, 192, 128, 96, 48];
const mytoken = 'homeassistant'; // 보안을 위해 필요시 변경하세요
const http = require('http');
const url = require("url");
const child_process = require("child_process");
const fs = require('fs');
const axios = require('axios');

// 라디오 리스트 로드
const data = JSON.parse(fs.readFileSync('/app/radio-list.json', 'utf8'));

const instance = axios.create({ timeout: 5000 });

function return_pipe(urls, resp, req) {
    const urlParts = url.parse(req.url, true);
    const atype = Number(urlParts.query["atype"] || 0);

    const xffmpeg = child_process.spawn("ffmpeg", [
        "-headers", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-loglevel", "error",
        "-i", urls,
        "-c:a", "mp3",
        "-b:a", (atype_list[atype] || 128) + "k",
        "-ar", "44100",
        "-ac", "2",
        "-f", "wav",
        "pipe:1"
    ]);

    xffmpeg.stdout.pipe(resp);
    console.log(`[Radio] New Stream Started (PID: ${xffmpeg.pid})`);

    // 클라이언트 접속 종료 시 FFmpeg 확실히 종료 (중요: HAOS 17 좀비 프로세스 방지)
    req.on("close", () => {
        if (xffmpeg) {
            console.log(`[Radio] Connection Closed (PID: ${xffmpeg.pid})`);
            xffmpeg.kill('SIGKILL'); 
        }
    });

    xffmpeg.on("error", (e) => console.error(`[FFmpeg Error] ${e}`));
}

const liveServer = http.createServer((req, resp) => {
    const urlParts = url.parse(req.url, true);
    const { pathname, query } = urlParts;

    // 1. Web UI 메인 화면 (브라우저 접속 시)
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
                    h2 { color: #03a9f4; margin-bottom: 30px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 30px; }
                    .channel-btn { background: #333; border: 1px solid #444; color: white; padding: 15px; 
                                   border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
                    .channel-btn:hover { background: #03a9f4; border-color: #03a9f4; }
                    .channel-btn.active { background: #ff9800; border-color: #ff9800; }
                    .player-box { background: #222; padding: 20px; border-radius: 15px; position: sticky; bottom: 20px; width: 100%; box-shadow: 0 -5px 15px rgba(0,0,0,0.5); }
                    audio { width: 100%; margin-top: 10px; }
                    #status { font-size: 0.9em; color: #888; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>📻 Korea Radio Player</h2>
                    <div class="grid">${channelButtons}</div>
                </div>
                <div class="player-box">
                    <div id="status">채널을 선택하세요</div>
                    <audio id="audio" controls autoplay></audio>
                </div>
                <script>
                    const audio = document.getElementById('audio');
                    const status = document.getElementById('status');
                    function play(key) {
                        // 현재 버튼 활성화 표시
                        document.querySelectorAll('.channel-btn').forEach(btn => btn.classList.remove('active'));
                        event.target.classList.add('active');
                        
                        const streamUrl = "/radio?token=${mytoken}&keys=" + key;
                        status.innerText = "재생 중: " + key.toUpperCase();
                        audio.src = streamUrl;
                        audio.play().catch(e => {
                            console.error("Autoplay blocked:", e);
                            status.innerText = "재생 버튼을 눌러주세요: " + key;
                        });
                    }
                </script>
            </body>
            </html>
        `);
        return;
    }

    if (pathname === "/radio" && query['token'] === mytoken) {
        const key = query['keys'];
        if (key && data[key]) {
            const myData = data[key];
            console.log(`[Request] Channel: ${key}`);

            if (myData === "kbs_lib") {
                getkbs(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (myData === "sbs_lib") {
                getsbs(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
            } else if (myData === "mbc_lib") {
                getmbc(key).then(url => url !== 'invaild' ? return_pipe(url, resp, req) : errorOut(resp));
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

// --- 방송사 파서 함수들 (기존 로직 유지) ---
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
        const res = await instance.get(`https://sminiplay.imbc.com/aacplay.ashx?agent=webapp&channel=${mbc_ch[ch]}`);
        return 'https://' + res.data.split('"https://')[1].split('"')[0];
    } catch { return "invaild"; }
}

async function getsbs(ch) {
    const sbs_ch = { 'sbs_power': ['powerfm', 'powerpc'], 'sbs_love': ['lovefm', 'lovepc'] };
    try {
        const res = await instance.get(`https://apis.sbs.co.kr/play-api/1.0/livestream/${sbs_ch[ch][1]}/${sbs_ch[ch][0]}?protocol=hls&ssl=Y`);
        return res.data;
    } catch { return "invaild"; }
}

liveServer.listen(port, '0.0.0.0', () => console.log(`Korea Radio Server running on port ${port}`));


