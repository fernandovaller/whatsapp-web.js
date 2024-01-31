const { Client, MessageMedia, Location, List, Buttons, LocalAuth } = require('./index');
const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const axios = require('axios');

const port = process.env.PORT || 8000;

const app = express();
const server = createServer(app);
const io = new Server(server);

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

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('a user connected');
});


const phoneNumberFormatter = function (number) {
    let formatted = number.replace(/\D/g, '');

    formatted = formatted.includes('@c.us') ? formatted : `${formatted}@c.us`;

    return formatted;
}

app.post('/send-media', async (req, res) => {
    const number = phoneNumberFormatter(req.body.number);
    const caption = req.body.caption;
    const fileUrl = req.body.file;

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

    console.log('mimetype', mimetype);
    console.log('attachment', attachment);

    res.status(200).json({
        status: true,
        response: mimetype
    });
});

server.listen(port, () => {
    console.log('Server running at http://localhost:' + port);
});