const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MySQL连接配置
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '54051496y',
    database: 'chat_app'
});

const onlineUsers = {}; // socket.id -> username

// 提供静态文件服务
app.use(express.static('../client'));

io.on('connection', (socket) => {
    console.log('A user connected');

    // 注册
    socket.on('register', ({ username, password }, callback) => {
        db.query('SELECT id FROM users WHERE username = ?', [username], (err, results) => {
            if (err) return callback({ success: false, message: '数据库错误' });
            if (results.length > 0) {
                callback({ success: false, message: '用户名已存在' });
            } else {
                db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err) => {
                    if (err) return callback({ success: false, message: '注册失败' });
                    callback({ success: true, message: '注册成功' });
                });
            }
        });
    });

    // 登录
    socket.on('login', ({ username, password }, callback) => {
        db.query('SELECT id FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
            if (err) return callback({ success: false, message: '数据库错误' });
            if (results.length > 0) {
                onlineUsers[socket.id] = username;
                io.emit('system message', `${username} 上线了`);
                callback({ success: true, message: '登录成功' });
            } else {
                callback({ success: false, message: '用户名或密码错误' });
            }
        });
    });

    // 聊天消息
    socket.on('chat message', (msg) => {
        const username = onlineUsers[socket.id] || '匿名';
        io.emit('chat message', { username, msg });
    });

    // 断开连接
    socket.on('disconnect', () => {
        const username = onlineUsers[socket.id];
        if (username) {
            io.emit('system message', `${username} 离开了`);
            delete onlineUsers[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});