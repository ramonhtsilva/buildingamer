const STEAM_KEY = '48218DD7AC23732B4281A771F10F13AF';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let { steamid } = req.query;
  if (!steamid) return res.status(400).json({ error: 'steamid obrigatório' });

  try {
    // Resolve vanity URL if not numeric
    if (!/^\d{17}$/.test(steamid)) {
      const vr = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_KEY}&vanityurl=${encodeURIComponent(steamid)}&format=json`);
      const vd = await vr.json();
      if (vd.response?.success !== 1) return res.status(404).json({ error: 'Username não encontrado. Use o SteamID64 (17 dígitos).' });
      steamid = vd.response.steamid;
    }

    // Fetch profile + games in parallel
    const [profileRes, gamesRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamid}&format=json`),
      fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1&format=json`),
    ]);

    const [profileData, gamesData] = await Promise.all([profileRes.json(), gamesRes.json()]);

    const player = profileData?.response?.players?.[0];
    if (!player) return res.status(404).json({ error: 'Perfil não encontrado ou privado.' });

    const games = gamesData?.response?.games || [];
    const gameCount = gamesData?.response?.game_count || games.length;
    const totalHours = Math.floor(games.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60);

    // Top 3 most played
    const top3 = games
      .filter(g => g.playtime_forever > 0)
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .slice(0, 3)
      .map(g => ({
        appid: g.appid,
        name: g.name || `App ${g.appid}`,
        hours: Math.floor(g.playtime_forever / 60)
      }));

    return res.status(200).json({
      steamid: player.steamid,
      name: player.personaname,
      avatar: player.avatarmedium || player.avatar,
      profileUrl: player.profileurl,
      gameCount,
      totalHours,
      top3,
      privateLibrary: gameCount === 0,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}
