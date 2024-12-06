const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3003;

// WebSocket 서버 생성을 Express 서버와 통합
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// CORS 설정
app.use(cors());

// uploads 폴더가 없으면 생성
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// public 폴더가 없으면 생성
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}

// 파일 업로드 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB 제한
    }
});

// 정적 파일 제공 설정 수정
app.use(express.static('public'));
app.use('/public', express.static('public'));

// 메인 페이지 라우트 추가
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'client', 'index.html'));
});

// 파일 변환 엔드포인트
app.post('/convert', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('파일이 업로드되지 않았습니다.');
    }

    const inputPath = req.file.path;
    const outputFileName = `${Date.now()}.gif`;
    const outputPath = path.join('public', outputFileName);

    // 클라이언트에 진행 상황을 전송하는 함수
    const sendProgress = (progress) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'progress', data: progress }));
            }
        });
    };

    ffmpeg(inputPath)
        .fps(10)
        .size('320x?')
        .on('progress', (progress) => {
            console.log(`처리 중: ${progress.percent}%`);
            sendProgress(progress.percent);
        })
        .on('end', () => {
            fs.unlinkSync(inputPath);
            res.json({
                success: true,
                gifUrl: `/public/${outputFileName}`
            });
        })
        .on('error', (err) => {
            console.error('Error:', err);
            if (fs.existsSync(inputPath)) {
                fs.unlinkSync(inputPath);
            }
            res.status(500).send('변환 중 오류가 발생했습니다.');
        })
        .toFormat('gif')
        .save(outputPath);
});

// 서버 시작 부분 수정
server.listen(port, () => {
    console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
}); 