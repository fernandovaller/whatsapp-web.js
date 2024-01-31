const { Client, MessageMedia, Location, List, Buttons, LocalAuth } = require('./index');
const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const axios = require('axios');
const qrcode = require('qrcode');
const fs = require('fs');

const port = process.env.PORT || 8000;

const app = express();
const server = createServer(app);
const io = new Server(server);

server.setMaxListeners(0);
io.setMaxListeners(0);

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

const client = new Client({
    authStrategy: new LocalAuth(),
    // proxyAuthentication: { username: 'username', password: 'password' },
    puppeteer: {
        // args: ['--proxy-server=proxy-server-that-requires-authentication.example.com'],
        headless: true
    }
});

client.initialize();

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

client.on('message', async msg => {

    // console.log('MESSAGE RECEIVED', msg);

    if (msg.body === '!info') {
        let info = client.info;
        client.sendMessage(msg.from, `
            *Connection info*
            User name: ${info.pushname}
            My number: ${info.wid.user}
            Platform: ${info.platform}
        `);
    }
});

io.on('connection', (socket) => {
    console.log('a user connected');

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code received, scan please!');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp is ready!');
        socket.emit('message', 'Whatsapp is ready!');
    });

    client.on('authenticated', () => {
        socket.emit('authenticated', 'Whatsapp is authenticated!');
        socket.emit('message', 'Whatsapp is authenticated!');
        console.log('AUTHENTICATED');
    });

    client.on('auth_failure', function (session) {
        socket.emit('message', 'Auth failure, restarting...');
    });

    client.on('disconnected', (reason) => {
        socket.emit('message', 'Whatsapp is disconnected!');
        client.destroy();
        client.initialize();
    });
});


const checkRegisteredNumber = async function (number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}

const phoneNumberFormatter = function (number) {
    let formatted = number.replace(/\D/g, '');

    formatted = formatted.includes('@c.us') ? formatted : `${formatted}@c.us`;

    return formatted;
}

const registrarLog = function (chanel = 'DEBUG', message, data = null) {
    const filePath = join(__dirname, '/data/app.log');

    let chanelName = chanel.toUpperCase();

    let datetime = new Date().toISOString();

    let row = `[${datetime}] app.${chanelName}: ${message}`;

    if (data !== null) {
        row += ` ${JSON.stringify(data, null, 0)}`;
    }

    row += '\n';

    fs.appendFileSync(filePath, row, (err) => {
        if (err) {
            console.error('Erro ao registrar o log:', err);
        }
    });
}

app.post('/send-message', async function (req, res) {
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    registrarLog('info', '[send-message] Request data receive', { number, message });

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
        registrarLog('error', '[send-message] The number is not registered', { number });
        return res.status(422).json({
            status: false,
            message: 'The number is not registered'
        });
    }

    client.sendMessage(number, message).then(response => {
        registrarLog('success', '[send-message] Message sent by whatsapp');
        res.status(200).json({
            status: true,
            response: response
        });
    }).catch(err => {
        registrarLog('error', '[send-message] Error when message sent by whatsapp', { err });
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

app.post('/send-media', async (req, res) => {
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const fileUrl = req.body.file;

    registrarLog('info', '[send-media] Request data receive', { number, caption, fileUrl });

    // const media = MessageMedia.fromFilePath('./image-example.png');
    // const file = req.files.file;
    // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
    let mimetype;
    const attachment = await axios.get(fileUrl, {
        responseType: 'arraybuffer'
    }).then(response => {
        mimetype = response.headers['content-type'];
        return response.data.toString('base64');
    });

    registrarLog('info', '[send-media] file converted to base64', { mimetype });

    const media = new MessageMedia(mimetype, attachment, 'Media');

    client.sendMessage(number, media, {
        caption: caption
    }).then(response => {
        registrarLog('success', '[send-media] File sent by whatsapp');
        res.status(200).json({
            status: true,
            response: {
                'number': number,
                'caption': caption,
                'fileUrl': fileUrl,
                'mimetype': mimetype
            }
        });
    }).catch(err => {
        registrarLog('error', '[send-media] Error when file sent by whatsapp', { err });
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

server.listen(port, () => {
    let message = `Server running at http://localhost:${port}`;
    console.log(message);
    registrarLog('info', message);
});