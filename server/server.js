//我现在创建的数据库有用户账号密码，历史记录，好友列表,待处理好友请求


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
const userSockets = {}; // username -> socket.id

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
             if (err || results.length === 0) {
            callback({ success: false, message: 'Invalid username or password' });
            } else {
                const user = results[0];
                const userId = user.id; // 在这里获取到 userId

                onlineUsers[socket.id] = username;
                userSockets[username] = socket.id;

                // 成功登录后，向客户端发送好友列表
                db.query('SELECT u.username FROM friends f JOIN users u ON f.friend_id = u.id WHERE f.user_id = ?', [userId], (err, friendResults) => {
                    if (err) {
                        console.error('Error fetching friends:', err);
                        // 即使获取好友列表失败，登录也应成功
                        socket.emit('friends list', []);
                    } else {
                        const friends = friendResults.map(row => row.username);
                        socket.emit('friends list', friends);
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

    // 在现有的 'chat message' 事件下方添加
    socket.on('private message', ({ to, msg }) => {
        const fromUsername = onlineUsers[socket.id];
        const toSocketId = userSockets[to];

        // 新增：检查消息内容是否为空
        if (!msg || !msg.trim()) {
            socket.emit('system message', '消息不能为空。');
            return;
        }
        if (toSocketId && toSocketId !== socket.id) { // 增加检查，确保不是发给自己
            // 向私聊对象发送消息
            io.to(toSocketId).emit('private message', { from: fromUsername, msg });
          
        } else {
            // 如果用户不在线，可以向发送者发送一个提示
            socket.emit('system message', `用户 ${to} 不在线或不存在。`);
        }
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