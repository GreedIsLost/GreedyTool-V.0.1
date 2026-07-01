const { EventEmitter } = require('events');
const SteamUser = require('steam-user');

class SteamIdler extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.status = 'disconnected';
    this.currentAppId = null;
    this.username = null;
  }

  login(username, password) {
    if (this.client) this.logout();

    this.username = username;
    this.status = 'connecting';
    this.emit('status', this.status);

    this.client = new SteamUser();

    this.client.on('loggedOn', () => {
      this.status = 'connected';
      this.emit('status', this.status);
      this.emit('loggedIn');
    });

    this.client.on('error', (err) => {
      this.emit('error', err.message || err);
    });

    this.client.on('steamGuard', (domain, callback) => {
      this.status = 'guard-needed';
      this.emit('guard-needed', domain);
      this._guardCallback = callback;
    });

    this.client.on('disconnected', (eresult) => {
      this.status = 'disconnected';
      this.currentAppId = null;
      this.emit('status', this.status);
      if (eresult) this.emit('error', 'Disconnected: ' + eresult);
    });

    this.client.logOn({
      accountName: username,
      password: password,
    });
  }

  submitGuard(code) {
    if (this._guardCallback) {
      this._guardCallback(code);
      this._guardCallback = null;
    }
  }

  startIdle(appId) {
    if (!this.client || !this.client.steamID) {
      this.emit('error', 'Not logged in');
      return;
    }
    this.currentAppId = appId;
    this.client.gamesPlayed([appId]);
    this.status = 'idling';
    this.emit('status', this.status);
    this.emit('idling-started', appId);
  }

  stopIdle() {
    if (!this.client) return;
    this.client.gamesPlayed([]);
    this.currentAppId = null;
    this.status = 'connected';
    this.emit('status', this.status);
    this.emit('idling-stopped');
  }

  logout() {
    if (this.client) {
      try { this.client.gamesPlayed([]); } catch {}
      try { this.client.logOff(); } catch {}
      try { this.client.removeAllListeners(); } catch {}
      this.client = null;
    }
    this.currentAppId = null;
    this.status = 'disconnected';
    this.emit('status', this.status);
  }

  getState() {
    return {
      status: this.status,
      username: this.username,
      currentAppId: this.currentAppId,
    };
  }
}

module.exports = SteamIdler;
