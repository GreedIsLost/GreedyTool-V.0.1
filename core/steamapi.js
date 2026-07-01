const axios = require('axios');

const API_BASE = 'https://store.steampowered.com/api';

async function searchGame(query) {
  const res = await axios.get(`${API_BASE}/storesearch/`, {
    params: { term: query, cc: 'US', l: 'en' },
    timeout: 8000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  return res.data;
}

async function getAppDetails(appId) {
  try {
    const res = await axios.get(`${API_BASE}/appdetails`, {
      params: { appids: appId, cc: 'US', l: 'en' },
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const data = res.data;
    if (data && data[String(appId)] && data[String(appId)].success) {
      const d = data[String(appId)].data;
      return {
        name: d.name,
        shortDescription: d.short_description || '',
        description: d.about_the_game || '',
        developer: Array.isArray(d.developers) ? d.developers.join(', ') : '',
        publisher: d.publishers ? (Array.isArray(d.publishers) ? d.publishers.join(', ') : d.publishers) : '',
        releaseDate: d.release_date ? d.release_date.date : '',
        price: d.price_overview ? `${d.price_overview.final_formatted}` : 'Free',
        headerImage: d.header_image || '',
        screenshots: (d.screenshots || []).slice(0, 5).map(s => s.path_full),
        genres: (d.genres || []).map(g => g.description).join(', '),
        metacritic: d.metacritic ? d.metacritic.score : null,
        steamAppId: d.steam_appid,
      };
    }
    return null;
  } catch (err) {
    console.error('SteamAPI getAppDetails error:', err.message);
    return null;
  }
}

module.exports = { searchGame, getAppDetails };
