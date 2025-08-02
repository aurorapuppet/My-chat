const socket = io();

const loginPage = document.getElementById('login-page');
const chatPage = document.getElementById('container');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const nicknameSpan = document.getElementById('nickname');

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
        socket.emit('chat message', msg);
        input.value = '';
    }
};

// 接收聊天消息
socket.on('chat message', (data) => {
    const messages = document.getElementById('messages');
    const li = document.createElement('li');
    li.textContent = `${data.username}: ${data.msg}`;
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
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