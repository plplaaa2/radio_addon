const port = 3005;
const atype_list = [256, 192, 128, 96, 48];
const atype_names = ["256k (고음질)", "192k (표준)", "128k (절약)", "96k (낮음)", "48k (터널용)"];
const mytoken = 'homeassistant'; 
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
    console.log(`[Radio] Stream Started: ${atype_list[atype]}k (PID: ${xffmpeg.pid})`);

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
                    .settings-box { background: #222; padding: 15px; border-radius: 10px; margin-bottom: 20px; width: 100%; text-align: left; }
                    .settings-label { font-size: 0.8em; color: #888; margin-bottom: 8px; display: block; }
                    select { width: 100%; padding: 12px; background: #333; color: white; border: 1px solid #444; border-radius: 5px; font-size: 1rem; cursor: pointer; }
                    
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 30px; }
                    .channel-btn { background: #333; border: 1px solid #444; color: white; padding: 15px; 
                                   border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
                    .channel-btn:hover { background: #03a9f4; border-color: #03a9f4; }
                    .channel-btn.active { background: #ff9800; border-color: #ff9800; }
                    
                    .player-box { background: #222; padding: 20px; border-radius: 15px; position: sticky; bottom: 20px; width: 100%; box-shadow: 0 -5px 15px rgba(0,0,0,0.5); box-sizing: border-box; }
                    audio { width: 100%; margin-top: 10px; }
                    #status { font-size: 0.9em; color: #888; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>📻 Korea Radio</h2>
                    
                    <div class="settings-box">
                        <span class="settings-label">스트리밍 음질 선택</span>
                        <select id="quality">
                            ${atype_names.map((name, i) => `<option value="${i}">${name}</option>`).join('')}
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
