const socket = io();

const loginPage = document.getElementById('login-page');
const chatPage = document.getElementById('container');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const nicknameSpan = document.getElementById('nickname');
const contactsList = document.getElementById('contacts');
const addFriendInput = document.getElementById('add-friend-input');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendRequestsContainer = document.getElementById('friend-requests-container');
const friendRequestsList = document.getElementById('friend-requests-list');



let isRegisterMode = false;

registerBtn.onclick = () => {
    isRegisterMode = !isRegisterMode;
    document.getElementById('login-title').textContent = isRegisterMode ? '注册' : '登录';
    loginBtn.textContent = isRegisterMode ? '注册' : '登录';
    registerBtn.textContent = isRegisterMode ? '返回登录' : '注册';
};

loginBtn.onclick = () => {
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();
    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }
    if (isRegisterMode) {
        socket.emit('register', { username, password }, (res) => {
            alert(res.message);
            if (res.success) {
                isRegisterMode = false;
                document.getElementById('login-title').textContent = '登录';
                loginBtn.textContent = '登录';
                registerBtn.textContent = '注册';
            }
        });
    } else {
        // 登录成功后
        socket.emit('login', { username, password }, (res) => {
            alert(res.message);
            if (res.success) {
                window.currentUser = username;
                localStorage.setItem('chat_username', username);
                localStorage.setItem('chat_password', password);
                nicknameSpan.textContent = username;
                loginPage.style.display = 'none';
                chatPage.style.display = 'flex';
            }
        });
    }
};

// 页面加载时自动登录
window.onload = function() {
    const username = localStorage.getItem('chat_username');
    const password = localStorage.getItem('chat_password');
    if (username && password) {
        socket.emit('login', { username, password }, (res) => {
            if (res.success) {
                window.currentUser = username;
                nicknameSpan.textContent = username;
                loginPage.style.display = 'none';
                chatPage.style.display = 'flex';
            } else {
                // 清除错误的缓存
                localStorage.removeItem('chat_username');
                localStorage.removeItem('chat_password');
            }
        });
    }
};

// 聊天发送
document.getElementById('sendBtn').onclick = () => {
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg && window.currentUser) {
        if (currentChatTarget === 'general') {
            socket.emit('chat message', msg); // 发送群聊
        } else {
            socket.emit('private message', { to: currentChatTarget, msg }); // 发送私聊
              // 注意：这里不需要再调用 appendMessage，因为服务器会把消息发回来
            appendMessage({ from: window.currentUser, to: currentChatTarget, msg, isPrivate: true }); // 直接渲染自己的私聊消息
        }
        input.value = '';
    }
};

// 封装一个消息渲染函数，便于管理
function appendMessage(data) {
    const messages = document.getElementById('messages');
    const item  = document.createElement('div');
    // 添加消息项的基本类
    item.classList.add('message-item');
    
    // 创建一个用于包裹消息内容的div
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    
    let messageText = '';
    // 修正判断逻辑
    const isMe = data.from === window.currentUser || data.username === window.currentUser;

    if (data.isPrivate) {
        // 私聊消息
        if (isMe) {
            // ✅ 你发送的私聊
            item.classList.add('my-message');
            messageText = `<strong>${data.from}</strong>: ${data.msg}`;
        } else {
            // ✅ 对方发来的私聊
            item.classList.add('other-message');
            messageText = `<strong>${data.from}</strong>: ${data.msg}`;
        }
    } else {
        // 群聊消息
        if (isMe) {
            item.classList.add('my-message');
        } else {
            item.classList.add('other-message');
        }
        messageText = `<strong>${data.username}</strong>: ${data.msg}`;
    }

    contentDiv.innerHTML = messageText;
    item.appendChild(contentDiv);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

// 在 login success block 里
socket.on('friends list', (friends) => {
    // 清空联系人列表并重新渲染
    contactsList.innerHTML = '';
    // 渲染群聊大厅
    const groupChatLi = document.createElement('li');
    groupChatLi.textContent = '群聊大厅';
    groupChatLi.dataset.username = 'general'; // 设置群聊大厅的标识
    contactsList.appendChild(groupChatLi);

    // 渲染好友列表
    friends.forEach(friend => {
        const li = document.createElement('li');
        li.textContent = friend;
        li.dataset.username = friend;
        contactsList.appendChild(li);
    });
});
// 发送好友请求
addFriendBtn.onclick = () => {
    const friendUsername = addFriendInput.value.trim();
    if (friendUsername) {
        socket.emit('send friend request', { friendUsername }, (res) => {
            alert(res.message);
            if (res.success) {
                // 如果添加成功，清空输入框并等待服务器更新列表
                addFriendInput.value = '';
            }
        });
    }
};

// 监听新的好友请求通知
socket.on('new friend request', (data) => {
    const { sender } = data;
    alert(`你收到了来自 ${sender} 的好友请求！`); // 弹窗提示用户

    // 在请求列表中添加新项
    friendRequestsContainer.style.display = 'block'; // 确保请求容器可见
    const li = document.createElement('li');
    li.innerHTML = `<span>${sender}</span> <button class="accept-btn" data-username="${sender}">同意</button> <button class="reject-btn" data-username="${sender}">拒绝</button>`;
    friendRequestsList.appendChild(li);
});

// 接收好友请求列表（登录时）
socket.on('pending friend requests', (requests) => {
    if (requests.length > 0) {
        friendRequestsContainer.style.display = 'block';
        friendRequestsList.innerHTML = '';
        requests.forEach(sender => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${sender}</span> <button class="accept-btn" data-username="${sender}">同意</button> <button class="reject-btn" data-username="${sender}">拒绝</button>`;
            friendRequestsList.appendChild(li);
        });
    } else {
        friendRequestsContainer.style.display = 'none';
    }
});

// 监听“同意”和“拒绝”按钮的点击事件
friendRequestsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('accept-btn')) {
        const senderUsername = e.target.dataset.username;
        socket.emit('accept friend request', { senderUsername }, (res) => {
            if (res.success) {
                // 移除请求列表中的项
                e.target.closest('li').remove();
                if (friendRequestsList.children.length === 0) {
                    friendRequestsContainer.style.display = 'none';
                }
                // 提示用户
                alert(`已同意 ${senderUsername} 的好友请求`);
            } else {
                alert('操作失败');
            }
        });
    } else if (e.target.classList.contains('reject-btn')) {
        const senderUsername = e.target.dataset.username;
        socket.emit('reject friend request', { senderUsername }, (res) => {
            if (res.success) {
                // 移除请求列表中的项
                e.target.closest('li').remove();
                if (friendRequestsList.children.length === 0) {
                    friendRequestsContainer.style.display = 'none';
                }
                alert(`已拒绝 ${senderUsername} 的好友请求`);
            } else {
                alert('操作失败');
            }
        });
    }
});

let currentChatTarget = 'general'; // 默认是群聊

// 为联系人列表添加点击事件监听器
contactsList.addEventListener('click', (e) => {
    // 使用 e.target.closest('li') 确保无论点击 li 还是 li 内部的文本，都能获取到正确的 li 元素
    const clickedLi = e.target.closest('li');
    if (!clickedLi) return; // 如果点击的不是 li 元素，则返回

    // 移除所有联系人的 'active' 样式
    const allContacts = contactsList.querySelectorAll('li');
    allContacts.forEach(contact => contact.classList.remove('active'));

    // 为当前点击的联系人添加 'active' 样式
    clickedLi.classList.add('active');

    // 获取聊天目标，大厅的 data-username 应该设置为 'general'
    const toUser = clickedLi.dataset.username;

    if (toUser) {
        // 更新全局聊天目标变量
        currentChatTarget = toUser;
        // 更新聊天窗口的标题
        // **修正这里的逻辑**：根据 toUser 判断是群聊还是私聊
        if (toUser === 'general') {
            document.getElementById('chat-header').textContent = '群聊大厅';
        } else {
            document.getElementById('chat-header').textContent = ` ${toUser} `;
        }
        // 切换聊天时清空消息列表，可以根据需要优化为加载历史记录
        document.getElementById('messages').innerHTML = '';
        socket.emit('load history', { target: toUser });
        // 提示：你可以在这里添加一个逻辑来从服务器加载私聊历史记录
        // 例如：socket.emit('load history', { target: toUser });
    }
});

// 新增 'chat history' 事件监听器
socket.on('chat history', (history) => {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; // 先清空，再加载历史记录
    
    history.forEach(message => {
        const item = document.createElement('div');
        
        // 关键修改: 为私聊消息添加 my-message 或 other-message 类
        const isMe = (message.sender === window.currentUser);
        
        if (message.receiver === 'general') {
            // 群聊消息
            item.classList.add('message-item');
            const contentDiv = document.createElement('div');
            contentDiv.classList.add('message-content', 'other-message'); // 群聊消息默认左对齐
            contentDiv.innerHTML = `<strong>${message.sender}:</strong> ${message.msg}`;
            item.appendChild(contentDiv);
            
        } else {
            // 私聊消息
            item.classList.add('message-item', isMe ? 'my-message' : 'other-message');
            const contentDiv = document.createElement('div');
            contentDiv.classList.add('message-content');
            contentDiv.innerHTML = `<strong>${message.sender}</strong>: ${message.msg}`;
            item.appendChild(contentDiv);
        }
        
        messagesDiv.appendChild(item);
    });
    
    // 自动滚动到最新消息
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// 接收私聊消息
socket.on('private message', (data) => {
    // 只有当消息的发送者是当前正在私聊的对象时，才渲染到聊天框中
    // 并且发送者不是自己
    if (currentChatTarget === data.from && data.from !== window.currentUser) {
        appendMessage({ username: data.from, msg: data.msg, isPrivate: true });
    }
    
    // 如果收到了来自非当前私聊对象的消息，可以在这里处理未读提示等
    console.log(`你收到来自 ${data.from} 的新私聊消息: ${data.msg}`);
});

// 修改群聊消息的接收逻辑，使用新的渲染函数
socket.on('chat message', (data) => {
    // 只有当前在群聊大厅时才显示
    if (currentChatTarget === 'general') {
        appendMessage({ username: data.username, msg: data.msg, isPrivate: false });
    }
});

// 接收系统通知
socket.on('system message', (msg) => {
    const messages = document.getElementById('messages');
    const li = document.createElement('li');
    li.textContent = `[系统] ${msg}`;
    li.style.color = 'gray';
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
});

document.getElementById('logoutBtn').onclick = function() {
    localStorage.removeItem('chat_username');
    localStorage.removeItem('chat_password');
    window.currentUser = null;
    document.getElementById('container').style.display = 'none';
    document.getElementById('login-page').style.display = 'flex';
};