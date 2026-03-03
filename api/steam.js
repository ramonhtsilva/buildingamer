const STEAM_KEY = '48218DD7AC23732B4281A771F10F13AF';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { steamid } = req.query;

  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'SteamID64 inválido' });
  }

  try {
    const [profileRes, gamesRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamid}&format=json`),
      fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${steamid}&include_played_free_games=1&format=json`),
    ]);

    const [profileData, gamesData] = await Promise.all([
      profileRes.json(),
      gamesRes.json(),
    ]);

    const player = profileData?.response?.players?.[0];
    if (!player) return res.status(404).json({ error: 'Perfil não encontrado ou privado' });

    const games = gamesData?.response?.games || [];
    const gameCount = gamesData?.response?.game_count || games.length;
    const totalMinutes = games.reduce((s, g) => s + (g.playtime_forever || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    // Top 3 most played games
    const top3 = games
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .slice(0, 3)
      .map(g => ({ appid: g.appid, hours: Math.floor(g.playtime_forever / 60) }));

    return res.status(200).json({
      name: player.personaname,
      avatar: player.avatarmedium || player.avatar,
      steamid: player.steamid,
      profileUrl: player.profileurl,
      gameCount,
      totalHours,
      top3,
      memberSince: player.timecreated,
      privateLibrary: gameCount === 0,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar dados da Steam: ' + err.message });
  }
}
