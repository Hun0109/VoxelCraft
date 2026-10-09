// LocalStorage-based Auth & User Profile Management
class AuthManager {
  constructor() {
    this.USERS_KEY = 'boom_arena_users_v1';
    this.SESSION_KEY = 'boom_arena_session_v1';
    this.currentUser = null;
    this.init();
  }

  init() {
    const saved = localStorage.getItem(this.SESSION_KEY);
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch (e) {
        this.currentUser = null;
      }
    }
    if (!this.currentUser) {
      // Create default guest user if no session
      this.loginAsGuest();
    }
  }

  getUsers() {
    const raw = localStorage.getItem(this.USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  saveUsers(users) {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  }

  saveSession(user) {
    this.currentUser = user;
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
  }

  loginAsGuest() {
    const guestNum = Math.floor(1000 + Math.random() * 9000);
    const guestUser = {
      username: `guest_${guestNum}`,
      nickname: `게스트#${guestNum}`,
      isGuest: true,
      color: '#00f2fe',
      hat: '🧢',
      coins: 100,
      stats: {
        matches: 0,
        wins: 0,
        bombTags: 0
      }
    };
    this.saveSession(guestUser);
    return guestUser;
  }

  register(username, password, nickname) {
    if (!username || username.trim().length < 3) {
      return { success: false, message: '아이디는 3자 이상이어야 합니다.' };
    }
    if (!password || password.length < 4) {
      return { success: false, message: '비밀번호는 4자 이상이어야 합니다.' };
    }
    const cleanNick = (nickname || username).trim();

    const users = this.getUsers();
    if (users[username]) {
      return { success: false, message: '이미 존재하는 아이디입니다.' };
    }

    const newUser = {
      username,
      password: btoa(password), // simple base64 hash for browser demo
      nickname: cleanNick,
      isGuest: false,
      color: '#00f2fe',
      hat: '👑',
      coins: 200,
      stats: {
        matches: 0,
        wins: 0,
        bombTags: 0
      },
      createdAt: Date.now()
    };

    users[username] = newUser;
    this.saveUsers(users);
    this.saveSession(newUser);
    return { success: true, user: newUser };
  }

  login(username, password) {
    const users = this.getUsers();
    const user = users[username];
    if (!user) {
      return { success: false, message: '존재하지 않는 아이디입니다.' };
    }
    if (user.password !== btoa(password)) {
      return { success: false, message: '비밀번호가 일치하지 않습니다.' };
    }
    this.saveSession(user);
    return { success: true, user };
  }

  logout() {
    localStorage.removeItem(this.SESSION_KEY);
    return this.loginAsGuest();
  }

  updateProfile(updates) {
    if (!this.currentUser) return;
    this.currentUser = { ...this.currentUser, ...updates };
    this.saveSession(this.currentUser);

    if (!this.currentUser.isGuest) {
      const users = this.getUsers();
      if (users[this.currentUser.username]) {
        users[this.currentUser.username] = { ...users[this.currentUser.username], ...updates };
        this.saveUsers(users);
      }
    }
  }

  recordMatch(won = false) {
    if (!this.currentUser) return;
    this.currentUser.stats.matches += 1;
    if (won) {
      this.currentUser.stats.wins += 1;
      this.currentUser.coins += 50;
    } else {
      this.currentUser.coins += 15;
    }
    this.updateProfile({ stats: this.currentUser.stats, coins: this.currentUser.coins });
  }
}

window.auth = new AuthManager();
