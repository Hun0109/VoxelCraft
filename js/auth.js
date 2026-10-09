// Auth Manager with Supabase Cloud DB Support & LocalStorage Fallback
class AuthManager {
  constructor() {
    this.USERS_KEY = 'boom_arena_users_v1';
    this.SESSION_KEY = 'boom_arena_session_v1';
    this.currentUser = null;
    this.supabase = null;
    this.isSupabaseEnabled = false;
    this.init();
  }

  async init() {
    // Check Supabase configuration
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey && window.supabase) {
      try {
        this.supabase = window.supabase.createClient(
          window.SUPABASE_CONFIG.url,
          window.SUPABASE_CONFIG.anonKey
        );
        this.isSupabaseEnabled = true;
        console.log('⚡ Supabase Cloud DB Connected!');
      } catch (err) {
        console.warn('Supabase init failed, falling back to LocalStorage', err);
        this.isSupabaseEnabled = false;
      }
    }

    // Load active session
    const saved = localStorage.getItem(this.SESSION_KEY);
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch (e) {
        this.currentUser = null;
      }
    }
    if (!this.currentUser) {
      this.loginAsGuest();
    }
  }

  // SHA-256 Hash using browser Web Crypto API
  async hashPassword(password) {
    const enc = new TextEncoder().encode(password + '_boom_arena_salt_2026');
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
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

  async register(username, password, nickname) {
    if (!username || username.trim().length < 3) {
      return { success: false, message: '아이디는 3자 이상이어야 합니다.' };
    }
    if (!password || password.length < 4) {
      return { success: false, message: '비밀번호는 4자 이상이어야 합니다.' };
    }
    const cleanUser = username.trim().toLowerCase();
    const cleanNick = (nickname || username).trim();
    const passwordHash = await this.hashPassword(password);

    // If Supabase is connected
    if (this.isSupabaseEnabled && this.supabase) {
      try {
        // Check if username exists
        const { data: existing, error: checkErr } = await this.supabase
          .from('boom_profiles')
          .select('username')
          .eq('username', cleanUser)
          .maybeSingle();

        if (existing) {
          return { success: false, message: '이미 존재하는 아이디입니다.' };
        }

        const newUser = {
          username: cleanUser,
          password_hash: passwordHash,
          nickname: cleanNick,
          color: '#00f2fe',
          hat: '👑',
          coins: 200,
          matches: 0,
          wins: 0
        };

        const { error: insertErr } = await this.supabase
          .from('boom_profiles')
          .insert([newUser]);

        if (insertErr) {
          console.error(insertErr);
          return { success: false, message: 'Supabase 등록 실패: ' + insertErr.message };
        }

        const sessionUser = {
          username: cleanUser,
          nickname: cleanNick,
          isGuest: false,
          color: '#00f2fe',
          hat: '👑',
          coins: 200,
          stats: { matches: 0, wins: 0 }
        };

        this.saveSession(sessionUser);
        return { success: true, user: sessionUser };
      } catch (e) {
        return { success: false, message: e.message };
      }
    }

    // LocalStorage Fallback
    const users = this.getUsers();
    if (users[cleanUser]) {
      return { success: false, message: '이미 존재하는 아이디입니다.' };
    }

    const newUser = {
      username: cleanUser,
      passwordHash,
      nickname: cleanNick,
      isGuest: false,
      color: '#00f2fe',
      hat: '👑',
      coins: 200,
      stats: { matches: 0, wins: 0, bombTags: 0 },
      createdAt: Date.now()
    };

    users[cleanUser] = newUser;
    this.saveUsers(users);
    this.saveSession(newUser);
    return { success: true, user: newUser };
  }

  async login(username, password) {
    const cleanUser = username.trim().toLowerCase();
    const passwordHash = await this.hashPassword(password);

    // If Supabase is connected
    if (this.isSupabaseEnabled && this.supabase) {
      try {
        const { data: user, error } = await this.supabase
          .from('boom_profiles')
          .select('*')
          .eq('username', cleanUser)
          .maybeSingle();

        if (error || !user) {
          return { success: false, message: '존재하지 않는 아이디입니다.' };
        }

        if (user.password_hash !== passwordHash) {
          return { success: false, message: '비밀번호가 일치하지 않습니다.' };
        }

        const sessionUser = {
          username: user.username,
          nickname: user.nickname,
          isGuest: false,
          color: user.color || '#00f2fe',
          hat: user.hat || '🧢',
          coins: user.coins || 100,
          stats: {
            matches: user.matches || 0,
            wins: user.wins || 0
          }
        };

        this.saveSession(sessionUser);
        return { success: true, user: sessionUser };
      } catch (e) {
        return { success: false, message: e.message };
      }
    }

    // LocalStorage Fallback
    const users = this.getUsers();
    const user = users[cleanUser];
    if (!user) {
      return { success: false, message: '존재하지 않는 아이디입니다.' };
    }
    if (user.passwordHash !== passwordHash && user.password !== btoa(password)) {
      return { success: false, message: '비밀번호가 일치하지 않습니다.' };
    }

    this.saveSession(user);
    return { success: true, user };
  }

  logout() {
    localStorage.removeItem(this.SESSION_KEY);
    return this.loginAsGuest();
  }

  async updateProfile(updates) {
    if (!this.currentUser) return;
    this.currentUser = { ...this.currentUser, ...updates };
    this.saveSession(this.currentUser);

    if (this.currentUser.isGuest) return;

    if (this.isSupabaseEnabled && this.supabase) {
      try {
        await this.supabase
          .from('boom_profiles')
          .update({
            nickname: this.currentUser.nickname,
            color: this.currentUser.color,
            hat: this.currentUser.hat,
            coins: this.currentUser.coins,
            matches: this.currentUser.stats.matches,
            wins: this.currentUser.stats.wins
          })
          .eq('username', this.currentUser.username);
      } catch (e) {
        console.error('Supabase update failed', e);
      }
    } else {
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
