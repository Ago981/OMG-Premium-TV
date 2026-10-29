// OMG Premium TV as a Zephyr TV extension (standard 1: docs/extensions.md in the Zephyr TV repository).
// TV channels from M3U playlists and Xtream Codes accounts, films and series of the accounts, their TV guides, and
// an optional MediaFlow / EasyProxy proxy. Playlists are read by Zephyr TV itself (zephyr.m3u), with the same rules
// as the OMG Premium TV add-on, so a channel has the same id in both.

const XTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20"; // many Xtream panels refuse browsers' User-Agents
const LIVE_MAX_AGE = 6 * 3600; // a playlist is read again after this long (seconds)
const PAGE = 100;

// ---------- texts ----------

const TEXTS = {
  it: {
    playlists: "Playlist M3U", playlistsInfo: "Una o più playlist M3U/M3U8: canali, gruppi, loghi e guida TV.",
    name: "Nome", address: "Indirizzo", addressHint: "https://…/lista.m3u",
    xtream: "Account Xtream", xtreamInfo: "Server, utente e password di un abbonamento Xtream Codes.",
    server: "Server", serverHint: "http://server:8080, o il link get.php completo", username: "Utente", password: "Password",
    format: "Formato dei canali", vod: "Film e serie dell'account",
    proxy: "Proxy", proxyInfo: "Facoltativo: un proxy MediaFlow o EasyProxy da cui far passare gli stream.",
    proxyUrl: "Indirizzo del proxy", proxyPassword: "Password del proxy", proxyType: "Tipo di proxy", auto: "Automatico",
    proxyOnly: "Solo tramite proxy", guide: "Guida TV delle playlist",
    playlist: "Playlist", channels: "Canali", films: "Film", series: "Serie TV", viaProxy: "Proxy",
  },
  en: {
    playlists: "M3U playlists", playlistsInfo: "One or more M3U/M3U8 playlists: channels, groups, logos and TV guide.",
    name: "Name", address: "Address", addressHint: "https://…/list.m3u",
    xtream: "Xtream accounts", xtreamInfo: "Server, user and password of an Xtream Codes subscription.",
    server: "Server", serverHint: "http://server:8080, or the whole get.php link", username: "User", password: "Password",
    format: "Channels' format", vod: "The account's films and series",
    proxy: "Proxy", proxyInfo: "Optional: a MediaFlow or EasyProxy proxy the streams go through.",
    proxyUrl: "Proxy address", proxyPassword: "Proxy password", proxyType: "Proxy type", auto: "Automatic",
    proxyOnly: "Through the proxy only", guide: "The playlists' TV guide",
    playlist: "Playlist", channels: "Channels", films: "Films", series: "TV Series", viaProxy: "Proxy",
  },
};
const T = (k) => (TEXTS[(globalThis.zephyr && zephyr.language) || "en"] || TEXTS.en)[k] || TEXTS.en[k] || k;

// ---------- settings ----------

const settingsOf = (a) => (a && a.settings) || globalThis.SCRAPER_SETTINGS || {};
const arr = (v) => (Array.isArray(v) ? v : []);

function playlists(s) {
  return arr(s.playlists).map((p, i) => ({ i, name: (p && p.name) || `${T("playlist")} ${i + 1}`, url: String((p && p.url) || "").trim() }))
    .filter((p) => /^https?:\/\//.test(p.url));
}

/** An Xtream account from its item: also a whole get.php / player_api.php link pasted as the server. */
function account(x, j) {
  let server = String((x && x.server) || "").trim();
  let username = String((x && x.username) || "").trim();
  let password = String((x && x.password) || "").trim();
  try {
    const u = new URL(server);
    username = username || u.searchParams.get("username") || "";
    password = password || u.searchParams.get("password") || "";
    server = `${u.protocol}//${u.host}${u.pathname.replace(/\/(player_api|get|xmltv)\.php$/i, "").replace(/\/+$/, "")}`;
  } catch (e) {
    server = server.replace(/\/+$/, "");
  }
  return { j, name: (x && x.name) || `Xtream ${j + 1}`, server, username, password,
    format: (x && x.format) === "ts" ? "ts" : "m3u8", vod: !(x && x.vod === false) };
}

function accounts(s) {
  return arr(s.xtream).map(account).filter((a) => /^https?:\/\//.test(a.server) && a.username && a.password);
}

// ---------- Xtream ----------

function api(a, action, extra) {
  const p = new URLSearchParams({ username: a.username, password: a.password });
  if (action) p.set("action", action);
  for (const k of Object.keys(extra || {})) p.set(k, String(extra[k]));
  return `${a.server}/player_api.php?${p.toString()}`;
}

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": XTREAM_UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const enc = encodeURIComponent;
const liveUrl = (a, id, ext) => `${a.server}/live/${enc(a.username)}/${enc(a.password)}/${enc(String(id))}.${ext}`;
const vodUrl = (a, kind, id, ext) => `${a.server}/${kind}/${enc(a.username)}/${enc(a.password)}/${enc(String(id))}.${/^[a-z0-9]{2,5}$/i.test(ext || "") ? ext : "mp4"}`;
const xmltvUrl = (a) => `${a.server}/xmltv.php?${new URLSearchParams({ username: a.username, password: a.password }).toString()}`;
const attr = (v) => String(v == null ? "" : v).replace(/["\r\n]/g, " ").trim();

/** An account's live channels as an M3U playlist, as the OMG Premium TV add-on writes it (xtreamToM3U). */
async function xtreamM3u(a) {
  const info = await getJson(api(a));
  const user = info && info.user_info;
  if (!user || Number(user.auth) !== 1) throw new Error("Xtream login failed");
  const formats = arr(user.allowed_output_formats).filter((f) => f === "m3u8" || f === "ts");
  const ext = !formats.length || formats.includes(a.format) ? a.format : formats[0];
  const [cats, streams] = await Promise.all([getJson(api(a, "get_live_categories")).catch(() => []), getJson(api(a, "get_live_streams"))]);
  const names = new Map(arr(cats).map((c) => [String(c.category_id), c.category_name]));
  const lines = [`#EXTM3U url-tvg="${xmltvUrl(a)}"`];
  for (const s of arr(streams)) {
    if (s.stream_id == null || !s.name) continue;
    const groups = (arr(s.category_ids).length ? s.category_ids : [s.category_id]).map((id) => names.get(String(id))).filter(Boolean).map(attr);
    const tags = [s.epg_channel_id ? `tvg-id="${attr(s.epg_channel_id)}"` : "", `tvg-name="${attr(s.name)}"`,
      s.stream_icon ? `tvg-logo="${attr(s.stream_icon)}"` : "", groups.length ? `group-title="${groups.join(";")}"` : ""].filter(Boolean).join(" ");
    lines.push(`#EXTINF:-1 ${tags},${attr(s.name).replace(/,/g, " ")}`);
    lines.push(`#EXTVLCOPT:http-user-agent=${XTREAM_UA}`);
    lines.push(liveUrl(a, s.stream_id, ext));
  }
  return lines.join("\n") + "\n";
}

/** An account's film or series categories, kept a few hours: name → id. */
async function vodCategories(a, kind) {
  const key = `cats:${kind}:${a.server}:${a.username}`;
  try {
    const kept = JSON.parse(localStorage.getItem(key) || "null");
    if (kept && Date.now() - kept.at < LIVE_MAX_AGE * 1000) return kept.cats;
  } catch (e) { /* read again */ }
  const list = await getJson(api(a, kind === "movie" ? "get_vod_categories" : "get_series_categories")).catch(() => []);
  const cats = arr(list).map((c) => [String(c.category_name || "").trim(), String(c.category_id)]).filter((c) => c[0]);
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), cats })); } catch (e) { /* full: not kept */ }
  return cats;
}

// ---------- live sources ----------

/** The live sources: each playlist ("p<i>"), each account ("x<j>"). */
function sources(s) {
  return [
    ...playlists(s).map((p) => ({ key: `p${p.i}`, name: p.name, playlist: p })),
    ...accounts(s).map((a) => ({ key: `x${a.j}`, name: a.name, account: a })),
  ];
}

/** Makes sure Zephyr TV has the source's playlist: read again when old. Its summary (channels, groups, guides). */
async function ensure(src) {
  if (src.playlist) return zephyr.m3u.load(src.key, { url: src.playlist.url, maxAge: LIVE_MAX_AGE });
  const a = src.account;
  const key = `live:${src.key}:${a.server}:${a.username}`;
  try {
    const kept = JSON.parse(localStorage.getItem(key) || "null");
    if (kept && Date.now() - kept.at < LIVE_MAX_AGE * 1000) return kept.summary;
  } catch (e) { /* read again */ }
  const summary = await zephyr.m3u.load(src.key, { text: await xtreamM3u(a) });
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), summary: { channels: summary.channels, groups: summary.groups, guides: [] } })); } catch (e) { /* full */ }
  return summary;
}

function sourceOf(s, key) {
  const src = sources(s).find((x) => x.key === key);
  if (!src) throw new Error(`no source ${key}`);
  return src;
}

// ---------- proxy ----------

async function proxyKind(s) {
  if (s.proxyType === "mediaflow" || s.proxyType === "easyproxy") return s.proxyType;
  const base = String(s.proxyUrl || "").replace(/\/+$/, "");
  const key = `proxy:${base}`;
  const kept = localStorage.getItem(key);
  if (kept) return kept;
  let kind = "mediaflow";
  try {
    const r = await fetch(`${base}/api/info?api_password=${enc(s.proxyPassword || "")}`);
    const j = r.ok ? await r.json() : {};
    if (String(j.proxy || "").toLowerCase().includes("easyproxy")) kind = "easyproxy";
  } catch (e) { /* MediaFlow, as the add-on assumes */ }
  try { localStorage.setItem(key, kind); } catch (e) { /* full */ }
  return kind;
}

const hasProxy = (s) => /^https?:\/\//.test(String(s.proxyUrl || "")) && !!s.proxyPassword;
const XTREAM_LINK = /\/(live|movie|series)\/[^/]+\/[^/]+\/[^/?]+\.[a-z0-9]{2,5}(\?|$)/i;

function headerParams(p, headers, url) {
  const ua = headers["User-Agent"] || headers["user-agent"];
  p.set("h_user-agent", ua || (XTREAM_LINK.test(url) ? XTREAM_UA : "Mozilla/5.0"));
  const referer = headers.Referer || headers.referer;
  if (referer) p.set("h_referer", referer);
  const origin = headers.Origin || headers.origin;
  if (origin) p.set("h_origin", origin);
}

/** The stream at [url] through the proxy, as the OMG Premium TV add-on builds it (proxy.ts). */
function proxied(kind, s, url, headers, clearkey) {
  const base = String(s.proxyUrl).replace(/\/+$/, "");
  const p = new URLSearchParams({ api_password: s.proxyPassword });
  if (kind === "easyproxy") {
    if (/\.mp4$/.test(url) && !clearkey && !XTREAM_LINK.test(url)) {
      p.set("d", url); headerParams(p, headers, url);
      return `${base}/proxy/stream?${p.toString()}`;
    }
    p.set("url", url); headerParams(p, headers, url);
    if (clearkey) p.set("clearkey", clearkey);
    return `${base}/proxy/manifest.m3u8?${p.toString()}`;
  }
  p.set("d", url); headerParams(p, headers, url);
  if (clearkey) {
    const pairs = clearkey.split(",").map((x) => x.split(":"));
    p.set("key_id", pairs.map((x) => x[0]).join(","));
    p.set("key", pairs.map((x) => x[1]).join(","));
    return `${base}/proxy/mpd/manifest.m3u8?${p.toString()}`;
  }
  if (/\.mpd($|\?)/.test(url)) return `${base}/proxy/mpd/manifest.m3u8?${p.toString()}`;
  if (/\.mp4$/.test(url)) return `${base}/proxy/stream?${p.toString()}`;
  return `${base}/proxy/hls/manifest.m3u8?${p.toString()}`;
}

/** A stream as Zephyr TV plays it: direct (unless through the proxy only) and through the proxy (when there's one). */
async function streamsOf(s, list) {
  const out = [];
  const kind = hasProxy(s) ? await proxyKind(s) : null;
  for (const st of list) {
    const headers = st.headers || {};
    const keys = st.clearkey ? Object.fromEntries(st.clearkey.split(",").map((x) => x.split(":"))) : null;
    if (!(kind && s.proxyOnly)) {
      out.push(Object.assign({ name: "OMG", title: st.name || "", url: st.url, behaviorHints: { proxyHeaders: { request: headers }, notWebReady: true } },
        keys ? { drm: { clearkey: keys } } : {}));
    }
    if (kind) out.push({ name: `OMG · ${T("viaProxy")}`, title: st.name || "", url: proxied(kind, s, st.url, headers, st.clearkey), behaviorHints: { notWebReady: true } });
  }
  return out;
}

// ---------- ids ----------
// A channel: "omg:<source>:<channel id>". A film: "omg:xm<j>:<id>:<extension>". A series: "omg:xs<j>:<id>",
// its episodes "omg:xs<j>:<id>:<season>:<episode>".

const split = (id) => String(id).split(":");

function channelMeta(src, c) {
  return { id: `omg:${src.key}:${c.id}`, type: "tv", name: c.name, logo: c.logo || undefined, poster: c.logo || undefined,
    genres: c.groups, epgId: c.epgId };
}

// ---------- handlers ----------

module.exports = {
  async settings() {
    return [
      { type: "list", key: "playlists", label: T("playlists"), description: T("playlistsInfo"), itemLabel: "name", item: [
        { type: "text", key: "name", label: T("name") },
        { type: "text", key: "url", label: T("address"), placeholder: T("addressHint") },
      ] },
      { type: "list", key: "xtream", label: T("xtream"), description: T("xtreamInfo"), itemLabel: "name", item: [
        { type: "text", key: "name", label: T("name") },
        { type: "text", key: "server", label: T("server"), placeholder: T("serverHint") },
        { type: "text", key: "username", label: T("username") },
        { type: "text", key: "password", label: T("password"), isPassword: true },
        { type: "select", key: "format", label: T("format"), options: [{ label: "HLS (m3u8)", value: "m3u8" }, { label: "MPEG-TS (ts)", value: "ts" }], defaultValue: "m3u8" },
        { type: "toggle", key: "vod", label: T("vod"), defaultValue: true },
      ] },
      { type: "header", label: T("proxy") },
      { type: "info", label: T("proxy"), description: T("proxyInfo") },
      { type: "text", key: "proxyUrl", label: T("proxyUrl"), placeholder: "https://proxy.example" },
      { type: "text", key: "proxyPassword", label: T("proxyPassword"), isPassword: true },
      { type: "select", key: "proxyType", label: T("proxyType"), options: [
        { label: T("auto"), value: "auto" }, { label: "MediaFlow", value: "mediaflow" }, { label: "EasyProxy", value: "easyproxy" }], defaultValue: "auto" },
      { type: "toggle", key: "proxyOnly", label: T("proxyOnly"), defaultValue: false },
      { type: "toggle", key: "playlistGuide", label: T("guide"), defaultValue: true },
    ];
  },

  async manifest(a) {
    const s = settingsOf(a);
    const catalogs = [];
    for (const src of sources(s)) {
      let groups = [];
      try { groups = arr((await ensure(src)).groups); } catch (e) { console.warn(`${src.name}: ${e.message}`); }
      catalogs.push({ type: "tv", id: `omg-${src.key}`, name: src.name,
        extra: [{ name: "genre", options: groups }, { name: "search" }, { name: "skip" }] });
    }
    for (const acc of accounts(s).filter((x) => x.vod)) {
      const films = await vodCategories(acc, "movie").catch(() => []);
      const shows = await vodCategories(acc, "series").catch(() => []);
      catalogs.push({ type: "movie", id: `omg-xm${acc.j}`, name: `${acc.name} · ${T("films")}`,
        extra: [{ name: "genre", options: films.map((c) => c[0]) }, { name: "search" }, { name: "skip" }] });
      catalogs.push({ type: "series", id: `omg-xs${acc.j}`, name: `${acc.name} · ${T("series")}`,
        extra: [{ name: "genre", options: shows.map((c) => c[0]) }, { name: "search" }, { name: "skip" }] });
    }
    return { catalogs };
  },

  async catalog(a) {
    const s = settingsOf(a);
    const extra = a.extra || {};
    const skip = Number(extra.skip) || 0;
    const key = String(a.id).replace(/^omg-/, "");
    if (a.type === "tv") {
      const src = sourceOf(s, key);
      await ensure(src);
      const list = await zephyr.m3u.channels(src.key, { group: extra.genre || "", search: extra.search || "", skip, limit: PAGE });
      return { metas: arr(list).map((c) => channelMeta(src, c)) };
    }
    const kind = a.type === "movie" ? "movie" : "series";
    const acc = accounts(s).find((x) => key === `${kind === "movie" ? "xm" : "xs"}${x.j}`);
    if (!acc) return { metas: [] };
    const cat = extra.genre ? (await vodCategories(acc, kind)).find((c) => c[0] === extra.genre) : null;
    const list = arr(await getJson(api(acc, kind === "movie" ? "get_vod_streams" : "get_series", cat ? { category_id: cat[1] } : {})));
    const words = String(extra.search || "").toLowerCase().split(/\s+/).filter(Boolean);
    const found = words.length ? list.filter((x) => words.every((w) => String(x.name || "").toLowerCase().includes(w))) : list;
    return { metas: found.slice(skip, skip + PAGE).map((x) => kind === "movie"
      ? { id: `omg:xm${acc.j}:${x.stream_id}:${x.container_extension || "mp4"}`, type: "movie", name: x.name,
          poster: x.stream_icon || undefined, imdbRating: x.rating ? String(x.rating) : undefined }
      : { id: `omg:xs${acc.j}:${x.series_id}`, type: "series", name: x.name, poster: x.cover || undefined,
          releaseInfo: x.releaseDate || x.release_date || undefined, description: x.plot || undefined }) };
  },

  async meta(a) {
    const s = settingsOf(a);
    const p = split(a.id);
    if (a.type === "tv") {
      const src = sourceOf(s, p[1]);
      await ensure(src);
      const c = await zephyr.m3u.channel(src.key, p.slice(2).join(":"));
      return { meta: c ? channelMeta(src, c) : null };
    }
    const acc = accounts(s).find((x) => p[1].slice(2) === String(x.j));
    if (!acc) return { meta: null };
    if (a.type === "movie") {
      const info = (await getJson(api(acc, "get_vod_info", { vod_id: p[2] }))) || {};
      const i = info.info || {};
      return { meta: { id: a.id, type: "movie", name: i.name || (info.movie_data || {}).name, description: i.plot || i.description,
        poster: i.movie_image || i.cover_big, background: arr(i.backdrop_path)[0], releaseInfo: String(i.releasedate || "").slice(0, 4) || undefined,
        genres: i.genre ? String(i.genre).split(/\s*[,/]\s*/) : [], imdbRating: i.rating ? String(i.rating) : undefined,
        runtime: i.duration || undefined } };
    }
    const info = (await getJson(api(acc, "get_series_info", { series_id: p[2] }))) || {};
    const i = info.info || {};
    const videos = [];
    for (const season of Object.keys(info.episodes || {})) {
      for (const e of arr(info.episodes[season])) {
        const ei = e.info || {};
        videos.push({ id: `omg:xs${acc.j}:${p[2]}:${Number(e.season || season)}:${Number(e.episode_num)}`, season: Number(e.season || season),
          episode: Number(e.episode_num), title: e.title, released: ei.releasedate || ei.air_date || undefined,
          thumbnail: ei.movie_image || undefined, overview: ei.plot || undefined });
      }
    }
    return { meta: { id: `omg:xs${acc.j}:${p[2]}`, type: "series", name: i.name, description: i.plot, poster: i.cover,
      background: arr(i.backdrop_path)[0], releaseInfo: String(i.releaseDate || i.release_date || "").slice(0, 4) || undefined,
      genres: i.genre ? String(i.genre).split(/\s*[,/]\s*/) : [], imdbRating: i.rating ? String(i.rating) : undefined, videos } };
  },

  async stream(a) {
    const s = settingsOf(a);
    const p = split(a.id);
    if (a.type === "tv") {
      const src = sourceOf(s, p[1]);
      await ensure(src);
      const c = await zephyr.m3u.channel(src.key, p.slice(2).join(":"));
      return { streams: c ? await streamsOf(s, arr(c.streams)) : [] };
    }
    const acc = accounts(s).find((x) => p[1].slice(2) === String(x.j));
    if (!acc) return { streams: [] };
    const headers = { "User-Agent": XTREAM_UA };
    if (a.type === "movie") return { streams: await streamsOf(s, [{ url: vodUrl(acc, "movie", p[2], p[3]), name: "", headers }]) };
    const info = (await getJson(api(acc, "get_series_info", { series_id: p[2] }))) || {};
    const [season, episode] = [Number(p[3]), Number(p[4])];
    const e = Object.keys(info.episodes || {}).flatMap((k) => arr(info.episodes[k]))
      .find((x) => Number(x.season) === season && Number(x.episode_num) === episode);
    return { streams: e ? await streamsOf(s, [{ url: vodUrl(acc, "series", e.id, e.container_extension), name: e.title || "", headers }]) : [] };
  },

  async guide(a) {
    const s = settingsOf(a);
    const urls = [];
    if (s.playlistGuide !== false) {
      for (const src of sources(s).filter((x) => x.playlist)) {
        try { urls.push(...arr((await ensure(src)).guides)); } catch (e) { /* none */ }
      }
    }
    for (const acc of accounts(s)) urls.push(xmltvUrl(acc));
    return { sources: [...new Set(urls)].map((url) => ({ url })) };
  },
};
