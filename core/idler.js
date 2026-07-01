const { EventEmitter } = require('events');
const SteamUser = require('steam-user');
const path = require('path');
const fs = require('fs-extra');

class SteamIdler extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.client = null;
    this.status = 'disconnected';
    this.currentAppId = null;
    this._pendingAppId = null;
    this._guardCallback = null;
    this._dataDir = null;
  }

  login(username, password) {
    if (this.client) this.logout();

    this.status = 'connecting';
    this.emit('status', this.status);

    this._dataDir = path.join(__dirname, '..', 'greed-idler-data');
    fs.ensureDirSync(this._dataDir);

    this.client = new SteamUser({
      dataDirectory: this._dataDir,
      autoRelogin: true,
    });

    this.client.on('loggedOn', () => {
      this.status = 'connected';
      this.emit('status', this.status);
      this.emit('loggedIn');

      if (this._pendingAppId) {
        this.currentAppId = this._pendingAppId;
        this.client.gamesPlayed([this._pendingAppId]);
        this.status = 'idling';
        this.emit('status', this.status);
        this.emit('idling-started', this._pendingAppId);
      }
    });

    this.client.on('error', (err) => {
      console.error('[idler]', err);
      this.emit('error', (err && err.message) || String(err));
    });

    this.client.on('steamGuard', (domain, callback, lastCodeWrong) => {
      this.status = 'guard-needed';
      this.emit('guard-needed', domain, lastCodeWrong);
      this._guardCallback = callback;
    });

    this.client.on('disconnected', (eresult) => {
      if (this.currentAppId) this._pendingAppId = this.currentAppId;
      this.currentAppId = null;
      this.status = 'disconnected';
      this.emit('status', this.status);
      if (eresult) console.error('[idler] disconnected:', eresult);
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
    this._pendingAppId = appId;
    this.client.gamesPlayed([appId]);
    this.status = 'idling';
    this.emit('status', this.status);
    this.emit('idling-started', appId);
  }

  stopIdle() {
    if (!this.client) return;
    this.client.gamesPlayed([]);
    this.currentAppId = null;
    this._pendingAppId = null;
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
    this.reset();
    this.emit('status', this.status);
  }

  getState() {
    return {
      status: this.status,
      currentAppId: this.currentAppId,
    };
  }
}

module.exports = SteamIdler;
