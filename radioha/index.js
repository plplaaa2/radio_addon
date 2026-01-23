const port = 3005;
const atype_list = [256, 192, 128, 96, 48];
const mytoken = 'homeassistant'; // 보안을 위해 필요시 변경하세요
const http = require('http');
const url = require("url");
const child_process = require("child_process");
const fs = require('fs');
const axios = require('axios');

// 라디오 리스트 로드
const data = JSON.parse(fs.readFileSync('./radio-list.json', 'utf8'));

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
