const { EventEmitter } = require('events');

const STATE_LABELS = {
  0: 'Offline',
  1: 'Online',
  2: 'Busy',
  3: 'Away',
  4: 'Snooze',
  5: 'Looking to Trade',
  6: 'Looking to Play',
};

class FriendsWatcher extends EventEmitter {
  constructor(client) {
    super();
    this.client = client;
    this.friends = [];
    this._interval = null;
    this._boundHandler = null;
    this._initialTimeout = null;
  }

  start() {
    if (!this.client || !this.client.steamID) {
      this.emit('error', 'Not logged in');
      return;
    }
    this._boundHandler = (steamID, personaState) => this._onPersonaState(steamID, personaState);
    this.client.on('friendPersonaState', this._boundHandler);
    this._initialTimeout = setTimeout(() => this.poll(), 1000);
    this._interval = setInterval(() => this.poll(), 30000);
  }

  stop() {
    if (this._initialTimeout) {
      clearTimeout(this._initialTimeout);
      this._initialTimeout = null;
    }
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    if (this._boundHandler && this.client) {
      try { this.client.removeListener('friendPersonaState', this._boundHandler); } catch {}
      this._boundHandler = null;
    }
  }

  poll() {
    if (!this.client || !this.client.steamID || !this.client.friends) return;
    const list = [];
    const count = this.client.friends.getFriendCount();
    for (let i = 0; i < count; i++) {
      try {
        const sid = this.client.friends.getFriendByIndex(i);
        const state = this.client.friends.getFriendPersonaState(sid);
        const name = this.client.friends.getFriendPersonaName(sid);
        const game = this.client.friends.getFriendGamePlayed(sid);
        const avatarHash = this.client.friends.getFriendAvatar(sid);
        let avatarUrl = null;
        if (avatarHash) {
          avatarUrl = `https://avatars.cloudflare.steamstatic.com/${avatarHash.toString('hex')}_medium.jpg`;
        }
        list.push({
          steamId: sid.toString(),
          name: name || 'Unknown',
          state,
          stateLabel: STATE_LABELS[state] || 'Unknown',
          gameName: (game && game.game_name) || null,
          gameId: (game && game.game_id) || null,
          avatarUrl,
        });
      } catch (err) {
        console.error('[friends] error reading friend', i, err);
      }
    }
    list.sort((a, b) => {
      if (a.state === 0 && b.state !== 0) return 1;
      if (a.state !== 0 && b.state === 0) return -1;
      return (a.name || '').localeCompare(b.name || '');
    });
    this.friends = list;
    this.emit('update', list);
  }

  _onPersonaState(steamID, personaState) {
    if (!this.client || !this._boundHandler) return;
    this.poll();
  }

  getFriends() {
    return this.friends;
  }
}

module.exports = FriendsWatcher;
