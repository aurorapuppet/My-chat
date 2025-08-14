//我现在创建的数据库有用户账号密码，历史记录，好友列表,待处理好友请求


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const bcrypt = require('bcrypt'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const multer = require('multer');
const path = require('path');

require('dotenv').config();


// MySQL连接配置
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});


const onlineUsers = {}; // socket.id -> username
const userSockets = {}; // username -> socket.id

// 提供静态文件服务
app.use(express.static('../client'));


    // 设置存储路径和文件名
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, path.join(__dirname, '../client/uploads'));
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + path.extname(file.originalname));
        }
    });
    const upload = multer({ 
        storage ,
        limits: { 
            fileSize: 1 * 1024 * 1024 // 限制 1MB
        },
        fileFilter: (req, file, cb) => {
            // 允许的 MIME 类型
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.mimetype)) {
                return cb(new Error('只允许上传 JPG/PNG/GIF/WEBP 图片'), false);
            }
            cb(null, true);
        }
    });

    // 注册接口（HTTP）
    app.post('/register', upload.single('avatar'), async (req, res) => {
        const { username, password } = req.body;
        const avatar_url = req.file ? `uploads/${req.file.filename}` : 'assets/default.jpg';

        db.query('SELECT id FROM users WHERE username = ?', [username], async (err, results) => {
            if (err) return res.json({ success: false, message: '数据库错误' });
            if (results.length > 0) {
                return res.json({ success: false, message: '用户名已存在' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            db.query('INSERT INTO users (username, password, avatar_url) VALUES (?, ?, ?)',
                [username, hashedPassword, avatar_url], (err) => {
                    if (err) return res.json({ success: false, message: '注册失败' });
                    res.json({ success: true, message: '注册成功' });
                });
        });
    });
    
    // 更新头像接口
    app.post('/update-avatar', upload.single('avatar'), (req, res) => {
        const username = req.body.username;
        if (!username) {
            return res.json({ success: false, message: '用户名缺失' });
        }
        const avatar_url = req.file ? `uploads/${req.file.filename}` : null;
        if (!avatar_url) {
            return res.json({ success: false, message: '未选择头像文件' });
        }

        db.query('UPDATE users SET avatar_url = ? WHERE username = ?', [avatar_url, username], (err) => {
            if (err) {
                return res.json({ success: false, message: '数据库更新失败' });
            }
            res.json({ success: true, avatar_url, message: '头像更新成功' });
        });
    });


io.on('connection', (socket) => {
    console.log('A user connected');

   /* // 注册逻辑（加密密码）
    socket.on('register', async ({ username, password, avatar_url }, callback) => {
        db.query('SELECT id FROM users WHERE username = ?', [username], async (err, results) => {
            if (err) return callback({ success: false, message: '数据库错误' });

            if (results.length > 0) {
                callback({ success: false, message: '用户名已存在' });
            } else {
                try {
                    const hashedPassword = await bcrypt.hash(password, 10);  // ✅ 加密这里非常关键
                    db.query('INSERT INTO users (username, password, avatar_url) VALUES (?, ?, ?)', [username, hashedPassword, avatar_url || 'assets/default.jpg'], (err) => {
                        if (err) return callback({ success: false, message: '注册失败' });
                        callback({ success: true, message: '注册成功' });
                    });
                } catch (e) {
                    callback({ success: false, message: '加密失败' });
                }
            }
        });
    });*/

    // 登录
    socket.on('login', ({ username, password }, callback) => {
        db.query('SELECT id, password, avatar_url FROM users WHERE username = ?', [username], async (err, results) => {
             if (err || results.length === 0) {
            callback({ success: false, message: 'Invalid username or password' });
            } else {
                const user = results[0];
                const userId = user.id; // 在这里获取到 userId
                const avatarUrl = user.avatar_url;

                onlineUsers[socket.id] = username;
                userSockets[username] = socket.id;

                 // PATCH: 增加 bcrypt.compare 校验密码
                const ok = await bcrypt.compare(password, user.password);
                if (!ok) {
                    return callback({ success: false, message: 'Invalid username or password' });
                }
                // 发送个人资料信息
                socket.emit('profile info', { username, avatar_url: avatarUrl });
            
                // 成功登录后，向客户端发送好友列表
                db.query('SELECT u.username, u.avatar_url FROM friends f JOIN users u ON f.friend_id = u.id WHERE f.user_id = ?', [userId], (err, friendResults) => {
                    if (err) {
                        socket.emit('friends list', []);
                    } else {
                        socket.emit('friends list', friendResults);
                    }
                });

                // 新增：加载收到的好友请求
                db.query('SELECT u.username FROM friend_requests fr JOIN users u ON fr.sender_id = u.id WHERE fr.receiver_id = ? AND fr.status = "pending"', [userId], (err, requestResults) => {
                    if (!err && requestResults.length > 0) {
                        const requests = requestResults.map(row => row.username);
                        socket.emit('pending friend requests', requests);
                    }
                });

                // 向所有在线用户广播新用户的上线
                io.emit('user list', Object.keys(userSockets));
                callback({ success: true, message: 'Login successful' });
            }
        });
    });

    
    //当客户端发送请求时，查找用户并将其添加到 friends 表中。
    socket.on('send friend request', (data, callback) => {
        const { friendUsername } = data;
        const currentUsername = onlineUsers[socket.id];

        if (!friendUsername || !currentUsername) {
            return callback({ success: false, message: '无效的用户信息' });
        }

        db.query('SELECT id FROM users WHERE username = ?', [currentUsername], (err, userResult) => {
            if (err || userResult.length === 0) {
                console.error('Error fetching current user ID:', err);
                return callback({ success: false, message: '当前用户不存在' });
            }
            const userId = userResult[0].id;

            db.query('SELECT id FROM users WHERE username = ?', [friendUsername], (err, friendResult) => {
                if (err || friendResult.length === 0) {
                    return callback({ success: false, message: '用户不存在' });
                }
                const friendId = friendResult[0].id;

                if (userId === friendId) {
                    return callback({ success: false, message: '不能添加自己' });
                }

                // 检查是否已经是好友
                db.query('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', 
                [userId, friendId, friendId, userId], (err, checkResult) => {
                    if (checkResult.length > 0) {
                        return callback({ success: false, message: '已经是好友' });
                    }
                    
                    // 检查是否已发送或收到过待处理的请求
                    db.query('SELECT * FROM friend_requests WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND status = "pending"', 
                    [userId, friendId, friendId, userId], (err, requestCheckResult) => {
                        if (requestCheckResult.length > 0) {
                            return callback({ success: false, message: '请求已发送或已收到，请勿重复操作' });
                        }

                        // 插入好友请求
                        db.query('INSERT INTO friend_requests (sender_id, receiver_id) VALUES (?, ?)', [userId, friendId], (err, insertResult) => {
                            if (err) {
                                console.error('Error sending friend request:', err);
                                return callback({ success: false, message: '发送请求失败' });
                            }
                            
                            console.log(`Friend request sent from ${currentUsername} to ${friendUsername}`);

                            // 如果接收方在线，发送实时通知
                            if (userSockets[friendUsername]) {
                                io.to(userSockets[friendUsername]).emit('new friend request', { sender: currentUsername });
                                console.log(`Notified online user ${friendUsername} about the new request.`);
                            }

                            callback({ success: true, message: '好友请求已发送' });
                        });
                    });
                });
            });
        });
    });

    socket.on('accept friend request', (data, callback) => {
        const { senderUsername } = data;
        const receiverUsername = onlineUsers[socket.id];

        // 查找发送者和接收者的ID
        db.query('SELECT id FROM users WHERE username = ?', [senderUsername], (err, senderResult) => {
            if (err || senderResult.length === 0) return callback({ success: false });
            const senderId = senderResult[0].id;
            
            db.query('SELECT id FROM users WHERE username = ?', [receiverUsername], (err, receiverResult) => {
                if (err || receiverResult.length === 0) return callback({ success: false });
                const receiverId = receiverResult[0].id;

                // 将请求状态更新为 accepted，并添加到 friends 表
                db.beginTransaction(err => {
                    if (err) return callback({ success: false });

                    db.query('UPDATE friend_requests SET status = "accepted" WHERE sender_id = ? AND receiver_id = ?', [senderId, receiverId], (err, updateResult) => {
                        if (err) return db.rollback(() => callback({ success: false }));

                        db.query('INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)', [senderId, receiverId, receiverId, senderId], (err, insertResult) => {
                            if (err) return db.rollback(() => callback({ success: false }));

                            db.commit(err => {
                                if (err) return db.rollback(() => callback({ success: false }));

                                // 成功后，通知双方更新好友列表
                                socket.emit('friend added', senderUsername);
                                if (userSockets[senderUsername]) {
                                    io.to(userSockets[senderUsername]).emit('friend added', receiverUsername);
                                }
                                callback({ success: true });
                            });
                        });
                    });
                });
            });
        });
    });

    socket.on('reject friend request', (data, callback) => {
        const { senderUsername } = data;
        const receiverUsername = onlineUsers[socket.id];

        db.query('SELECT id FROM users WHERE username = ?', [senderUsername], (err, senderResult) => {
            if (err || senderResult.length === 0) return callback({ success: false });
            const senderId = senderResult[0].id;
            
            db.query('SELECT id FROM users WHERE username = ?', [receiverUsername], (err, receiverResult) => {
                if (err || receiverResult.length === 0) return callback({ success: false });
                const receiverId = receiverResult[0].id;

                db.query('UPDATE friend_requests SET status = "rejected" WHERE sender_id = ? AND receiver_id = ?', [senderId, receiverId], (err, result) => {
                    if (err) return callback({ success: false });
                    callback({ success: true, message: '已拒绝请求' });
                });
            });
        });
    });

    // 聊天消息
    socket.on('chat message', (msg) => {
        const username = onlineUsers[socket.id];
        db.query('SELECT avatar_url FROM users WHERE username = ?', [username], (err, results) => {
            const avatar_url =
                !err && results.length > 0 ? results[0].avatar_url : 'assets/default.jpg';
            db.query(
                'INSERT INTO messages (sender, receiver, msg) VALUES (?, ?, ?)',
                [username, 'general', msg]
            );
            io.emit('chat message', { username, avatar_url, msg });
        });
    });

    // 私聊消息（扁平化结构）
    socket.on('private message', ({ to, msg }) => {
        const fromUsername = onlineUsers[socket.id];
        const toSocketId = userSockets[to];

        db.query('SELECT avatar_url FROM users WHERE username = ?', [fromUsername], (err, results) => {
            const avatar_url =
                !err && results.length > 0 ? results[0].avatar_url : 'assets/default.jpg';

            db.query(
                'INSERT INTO messages (sender, receiver, msg) VALUES (?, ?, ?)',
                [fromUsername, to, msg]
            );

            // 发给接收方
            if (toSocketId && toSocketId !== socket.id) {
                io.to(toSocketId).emit('private message', {
                    username: fromUsername,
                    avatar_url,
                    msg
                });
            }

            // 发给自己
            socket.emit('private message', {
                username: fromUsername,
                avatar_url,
                msg
            });
        });
    });

    // 新增 'load history' 事件
    socket.on('load history', (data) => {
        const { target } = data;
        const currentUsername = onlineUsers[socket.id];
        
        let query = '';
        let params = [];

        if (target === 'general') {
            // 加载群聊历史
            query = 'SELECT sender, receiver, msg, timestamp FROM messages WHERE receiver = ? ORDER BY timestamp ASC';
            params = [target];
        } else {
            // 加载私聊历史
            query = 'SELECT sender, receiver, msg, timestamp FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY timestamp ASC';
            params = [currentUsername, target, target, currentUsername];
        }
        
        db.query(query, params, (err, results) => {
            if (err) {
                console.error('Error loading chat history:', err);
                return;
            }
            // 将查询结果发送回客户端
            socket.emit('chat history', results);
        });
    });

    // 断开连接
    socket.on('disconnect', () => {
        const username = onlineUsers[socket.id];
        if (username) {
            io.emit('system message', `${username} 离开了`);
            delete onlineUsers[socket.id];
            delete userSockets[username]; // 新增：移除映射
            const activeUsers = Object.values(onlineUsers);
            io.emit('user list update', activeUsers); // 新增：发送更新后的用户列表
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});