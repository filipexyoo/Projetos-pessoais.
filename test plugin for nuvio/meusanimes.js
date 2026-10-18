// Scraper Nuvio - Meus Animes / Meus Doramas (serv01.meusdoramas.club)
// Fluxo (confirmado com testes no navegador):
//   1) GET /posts/get-video.php?tmdb=ID&season_number=T&episode_number=E
//      Funcionam dois IDs: o do TMDB com um dígito extra (124396 -> 1243961)
//      e o do TMDB puro (124396). Cada um devolve um link do Blogger.
//   2) resposta: { success, videoUrl }  -> videoUrl é
//        - string (blogger.com/video.g?token=...), ou
//        - lista [{label, file}] (arquivos diretos)
//   3) se for Blogger, abrir a página e ler os links em VIDEO_CONFIG.

const API = 'https://serv01.meusdoramas.club/posts/get-video.php';
const REFERER = 'https://serv01.meusdoramas.club/';
const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

const QUALIDADES = { 18: '360p', 22: '720p', 37: '1080p', 59: '480p', 43: '360p' };

function limpar(s) {
  return String(s)
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
}

// Lê os links de vídeo da página do Blogger (VIDEO_CONFIG -> streams)
async function streamsDoBlogger(urlBlogger) {
  const res = await fetch(urlBlogger, {
    headers: { 'User-Agent': UA, Referer: REFERER },
  });
  if (!res.ok) return [];
  const html = await res.text();

  const lista = [];
  const blocos = html.match(/\{[^{}]*"play_url"[^{}]*\}/g) || [];
  for (const b of blocos) {
    const u = b.match(/"play_url"\s*:\s*"([^"]+)"/);
    const f = b.match(/"format_id"\s*:\s*(\d+)/);
    if (!u) continue;
    lista.push({
      url: limpar(u[1]),
      quality: (f && QUALIDADES[f[1]]) || 'Auto',
    });
  }
  if (!lista.length) console.log('[meusanimes] nenhum play_url na página do Blogger');
  return lista;
}

// Pergunta à API com cada ID candidato e devolve todas as fontes que responderem
async function buscarFontes(tmdbId, t, e) {
  const candidatos = [
    { id: String(tmdbId) + t, rotulo: 'Fonte A' },
    { id: String(tmdbId), rotulo: 'Fonte B' },
  ];
  const fontes = [];
  for (const c of candidatos) {
    try {
      const res = await fetch(
        API + '?tmdb=' + c.id + '&season_number=' + t + '&episode_number=' + e,
        { headers: { 'User-Agent': UA, Referer: REFERER, Origin: REFERER.replace(/\/$/, '') } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.success && data.videoUrl) {
        fontes.push({ rotulo: c.rotulo, videoUrl: data.videoUrl });
      }
    } catch (err) {
      console.log('[meusanimes] falha com ID', c.id, err && err.message);
    }
  }
  return fontes;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    // O player só tem rota de episódio (temporada/episódio)
    const t = season || 1;
    const e = episode || 1;
    const base = 'T' + t + 'E' + e;

    const fontes = await buscarFontes(tmdbId, t, e);
    const streams = [];
    const vistos = {};

    function add(rotulo, url, quality, headers) {
      if (!url || vistos[url]) return;
      vistos[url] = true;
      streams.push({
        name: 'Meus Animes',
        title: base + ' - ' + rotulo + ' - ' + quality,
        url: url,
        quality: quality,
        headers: headers,
        provider: 'meusanimes',
      });
    }

    for (const f of fontes) {
      const v = f.videoUrl;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && item.file) {
            add(f.rotulo, item.file, item.label || 'Auto', { 'User-Agent': UA, Referer: REFERER });
          }
        }
      } else if (typeof v === 'string') {
        if (v.indexOf('blogger.com') !== -1) {
          const links = await streamsDoBlogger(v);
          for (const l of links) add(f.rotulo, l.url, l.quality, { 'User-Agent': UA });
        } else if (/\.(m3u8|mp4)(\?|$)/i.test(v)) {
          add(f.rotulo, v, 'Auto', { 'User-Agent': UA, Referer: REFERER });
        } else {
          console.log('[meusanimes] tipo de link não suportado:', v);
        }
      }
    }
    return streams;
  } catch (err) {
    console.log('[meusanimes] erro:', err && err.message);
    return [];
  }
}

module.exports = { getStreams };