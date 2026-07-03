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
    this.currentAppIds = [];
    this._pendingAppIds = [];
    this._guardCallback = null;
    this._dataDir = null;
    this._listeners = [];
    this.username = null;
  }

  login(username, password) {
    if (this.client) this.logout();

    this.username = username;
    this.status = 'connecting';
    this.emit('status', this.status);

    this._dataDir = path.join(__dirname, '..', 'greed-idler-data');
    fs.ensureDirSync(this._dataDir);

    this.client = new SteamUser({
      dataDirectory: this._dataDir,
      autoRelogin: true,
    });

    this._listeners = [];

    const onLoggedOn = () => {
      this.status = 'connected';
      this.client.setPersonaState(SteamUser.EPersonaState.Online);
      this.emit('status', this.status);
      this.emit('loggedIn');

      if (this._pendingAppIds.length > 0) {
        this.currentAppIds = [...this._pendingAppIds];
        this.client.gamesPlayed(this._pendingAppIds);
        this.status = 'idling';
        this.emit('status', this.status);
        this.emit('idling-started', this._pendingAppIds);
      }
    };
    this.client.on('loggedOn', onLoggedOn);
    this._listeners.push({ event: 'loggedOn', fn: onLoggedOn });

    const onError = (err) => {
      console.error('[idler]', err);
      this.emit('error', (err && err.message) || String(err));
    };
    this.client.on('error', onError);
    this._listeners.push({ event: 'error', fn: onError });

    const onSteamGuard = (domain, callback, lastCodeWrong) => {
      this.status = 'guard-needed';
      this.emit('guard-needed', domain, lastCodeWrong);
      this._guardCallback = callback;
    };
    this.client.on('steamGuard', onSteamGuard);
    this._listeners.push({ event: 'steamGuard', fn: onSteamGuard });

    const onDisconnected = (eresult) => {
      if (this.currentAppIds.length > 0) this._pendingAppIds = [...this.currentAppIds];
      this.currentAppIds = [];
      this.status = 'disconnected';
      this.emit('status', this.status);
      if (eresult) console.error('[idler] disconnected:', eresult);
    };
    this.client.on('disconnected', onDisconnected);
    this._listeners.push({ event: 'disconnected', fn: onDisconnected });

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

  startIdle(appIds) {
    if (!Array.isArray(appIds)) appIds = [appIds];
    const ids = appIds.filter(Boolean).map(Number).filter(n => n > 0);
    if (ids.length === 0) {
      this.emit('error', 'No valid App IDs');
      return;
    }
    if (!this.client || !this.client.steamID) {
      this._pendingAppIds = ids;
      this.emit('error', 'Not logged in');
      return;
    }
    this.currentAppIds = ids;
    this._pendingAppIds = ids;
    this.client.gamesPlayed(ids);
    this.status = 'idling';
    this.emit('status', this.status);
    this.emit('idling-started', ids);
  }

  stopIdle() {
    if (!this.client) return;
    this.client.gamesPlayed([]);
    this.currentAppIds = [];
    this._pendingAppIds = [];
    this.status = 'connected';
    this.emit('status', this.status);
    this.emit('idling-stopped');
  }

  logout() {
    if (this.client) {
      try { this.client.gamesPlayed([]); } catch {}
      try { this.client.logOff(); } catch {}
      for (const { event, fn } of this._listeners) {
        try { this.client.removeListener(event, fn); } catch {}
      }
      this.client = null;
    }
    this.reset();
    this.emit('status', this.status);
  }

  getClient() {
    return this.client;
  }

  getState() {
    return {
      status: this.status,
      currentAppIds: this.currentAppIds,
      username: this.username,
    };
  }
}

module.exports = SteamIdler;
