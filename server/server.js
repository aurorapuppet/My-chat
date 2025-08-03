const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const bcrypt = require('bcrypt'); 

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

// 从数据库中载入存在的信息
    db.query('SELECT username, message, timestamp FROM messages ORDER BY timestamp ASC', (err, results) => {
        if (err) {
            console.error('Error fetching messages:', err);
            return;
        }
        results.forEach(msg => {
            socket.emit('chat message', { username: msg.username, msg: msg.message });
        });
    });

    // 注册逻辑（加密密码）
    socket.on('register', async ({ username, password }, callback) => {
        db.query('SELECT id FROM users WHERE username = ?', [username], async (err, results) => {
            if (err) return callback({ success: false, message: '数据库错误' });

            if (results.length > 0) {
                callback({ success: false, message: '用户名已存在' });
            } else {
                try {
                    const hashedPassword = await bcrypt.hash(password, 10);  // ✅ 加密这里非常关键
                    db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
                        if (err) return callback({ success: false, message: '注册失败' });
                        callback({ success: true, message: '注册成功' });
                    });
                } catch (e) {
                    callback({ success: false, message: '加密失败' });
                }
            }
        });
    });

    // 登录
    socket.on('login', ({ username, password }, callback) => {
        db.query('SELECT id, password FROM users WHERE username = ?', [username], async (err, results) => {
            if (err) return callback({ success: false, message: '数据库错误' });

            if (results.length === 0) {
                return callback({ success: false, message: '用户名或密码错误' });
            }

            const hashedPassword = results[0].password;

            try {
                const isMatch = await bcrypt.compare(password, hashedPassword);  // ✅ 关键点密码验证、

                if (isMatch) {
                    onlineUsers[socket.id] = username;
                    io.emit('system message', `${username} 上线了`);
                    callback({ success: true, message: '登录成功' });
                } else {
                    callback({ success: false, message: '用户名或密码错误' });
                }
            } catch (err) {
                callback({ success: false, message: '密码验证失败' });
            }
        });
    });

    // 聊天消息
    socket.on('chat message', (msg) => {
        const username = onlineUsers[socket.id] || '匿名';
        // 将信息保存到数据库中
        db.query('INSERT INTO messages (username, message) VALUES (?, ?)', [username, msg], (err, result) => {
            if (err) {
                console.error('Error saving message to database:', err);
                return;
            }
            // 发送数据库中的信息到客户端
            io.emit('chat message', { username, msg });
        });
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