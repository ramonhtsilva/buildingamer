const STEAM_KEY = '48218DD7AC23732B4281A771F10F13AF';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  let { steamid } = req.query;

  if (!steamid) {
    return res.status(400).json({ error: 'SteamID obrigatório' });
  }

  // Accept: SteamID64 (17 digits), vanity URL name, or full profile URL
  // e.g. "hakamzinho", "https://steamcommunity.com/id/hakamzinho", "https://steamcommunity.com/profiles/76561198..."
  try {
    steamid = steamid.trim();

    // Extract from full URL
    const urlMatch = steamid.match(/steamcommunity\.com\/(id|profiles)\/([^\/\?]+)/);
    if (urlMatch) {
      if (urlMatch[1] === 'profiles') {
        steamid = urlMatch[2]; // already a SteamID64
      } else {
        steamid = urlMatch[2]; // vanity name
      }
    }

    // If not a 17-digit number, resolve vanity URL
    if (!/^\d{17}$/.test(steamid)) {
      const vanityRes = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_KEY}&vanityurl=${encodeURIComponent(steamid)}&format=json`
      );
      const vanityData = await vanityRes.json();
      if (vanityData?.response?.success !== 1) {
        return res.status(404).json({ error: `Perfil "${steamid}" não encontrado. Tente usar o SteamID64 (17 dígitos).` });
      }
      steamid = vanityData.response.steamid;
    }
  } catch (resolveErr) {
    return res.status(500).json({ error: 'Erro ao resolver perfil Steam: ' + resolveErr.message });
  }

  try {
    const [profileRes, gamesRes, recentRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamid}&format=json`),
      fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1&format=json`),
      fetch(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_KEY}&steamid=${steamid}&count=10&format=json`),
    ]);

    const [profileData, gamesData, recentData] = await Promise.all([
      profileRes.json(),
      gamesRes.json(),
      recentRes.json(),
    ]);

    const player = profileData?.response?.players?.[0];
    if (!player) return res.status(404).json({ error: 'Perfil não encontrado ou privado' });

    const games = gamesData?.response?.games || [];
    const gameCount = gamesData?.response?.game_count || games.length;
    const totalMinutes = games.reduce((s, g) => s + (g.playtime_forever || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    // Top 3 most played games (all time)
    const sorted = [...games].sort((a, b) => b.playtime_forever - a.playtime_forever);
    const top3 = sorted.slice(0, 3).map(g => ({
      appid: g.appid,
      name: g.name || `App ${g.appid}`,
      hours: Math.floor((g.playtime_forever || 0) / 60),
    }));

    // Recent game = top game played in last 2 weeks
    const recentGames = recentData?.response?.games || [];
    const topRecent = recentGames.sort((a, b) => (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0))[0];
    const recentGame = topRecent?.name || null;
    const recentAppid = topRecent?.appid || null;
    const recentHours = topRecent ? Math.floor((topRecent.playtime_2weeks || 0) / 60) : 0;

    return res.status(200).json({
      name: player.personaname,
      avatar: player.avatarmedium || player.avatar,
      steamid: player.steamid,
      profileUrl: player.profileurl,
      gameCount,
      totalHours,
      top3,
      recentGame,      // game most played in last 2 weeks
      recentAppid,     // appid of that game
      recentHours,     // hours in last 2 weeks
      memberSince: player.timecreated,
      privateLibrary: gameCount === 0,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar dados da Steam: ' + err.message });
  }
}
