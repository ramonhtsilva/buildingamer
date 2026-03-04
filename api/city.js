const STEAM_KEY = '48218DD7AC23732B4281A771F10F13AF';
const SUPABASE_URL = 'https://ntfyvegjurjefnynhnyx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50Znl2ZWdqdXJqZWZueW5obnl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODE3MDAsImV4cCI6MjA4ODE1NzcwMH0.0_1BdPPECsWnzltC-tL8j1AQmZWoTcAjfOj28Uxy9h4';

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, steamid } = req.query;

  try {
    // GET /api/city?action=list — return all gamers
    if (action === 'list') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/gamers?select=*&order=floors.desc`, { headers: sbHeaders });
      const data = await r.json();
      return res.status(200).json(data);
    }

    // POST /api/city?action=register&steamid=XXX — fetch Steam + save to Supabase
    if (action === 'register' && steamid) {
      let sid = steamid;

      // Resolve vanity if needed
      if (!/^\d{17}$/.test(sid)) {
        const vr = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_KEY}&vanityurl=${encodeURIComponent(sid)}&format=json`);
        const vd = await vr.json();
        if (vd.response?.success !== 1) return res.status(404).json({ error: 'Username não encontrado.' });
        sid = vd.response.steamid;
      }

      // Fetch Steam data
      const [profileRes, gamesRes] = await Promise.all([
        fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${sid}&format=json`),
        fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${sid}&include_appinfo=1&include_played_free_games=1&format=json`),
      ]);
      const [pd, gd] = await Promise.all([profileRes.json(), gamesRes.json()]);

      const player = pd?.response?.players?.[0];
      if (!player) return res.status(404).json({ error: 'Perfil não encontrado ou privado.' });

      const games = gd?.response?.games || [];
      const gameCount = gd?.response?.game_count || games.length;
      const totalHours = Math.floor(games.reduce((s, g) => s + (g.playtime_forever || 0), 0) / 60);
      const top3 = games
        .filter(g => g.playtime_forever > 0)
        .sort((a, b) => b.playtime_forever - a.playtime_forever)
        .slice(0, 3)
        .map(g => ({ appid: g.appid, name: g.name || `App ${g.appid}`, hours: Math.floor(g.playtime_forever / 60) }));

      const floors = Math.max(3, Math.floor(totalHours / 50) + Math.floor(gameCount / 5));
      const district = totalHours > 5000 ? 'DOWNTOWN' : totalHours > 2000 ? 'MIDTOWN' : totalHours > 500 ? 'UPTOWN' : 'SUBURBS';

      // Upsert to Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/gamers?on_conflict=steamid`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          steamid: sid,
          name: player.personaname,
          avatar: player.avatarmedium || player.avatar,
          hours: totalHours,
          games: gameCount,
          floors,
          district,
        }),
      });

      return res.status(200).json({
        steamid: sid,
        name: player.personaname,
        avatar: player.avatarmedium || player.avatar,
        totalHours,
        gameCount,
        floors,
        district,
        top3,
      });
    }

    return res.status(400).json({ error: 'Ação inválida.' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
