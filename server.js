const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  console.log('[LOG] ' + new Date().toLocaleTimeString() + ' - ' + req.method + ' ' + req.url);
  next();
});

function resolveUrl(relativeUrl, baseUrl) {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (e) {
    return relativeUrl;
  }
}

// 1. Recherche Wikipédia
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Recherche vide' });

  try {
    const wikiRes = await axios.get('https://fr.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        origin: '*'
      },
      headers: { 'User-Agent': 'SafariPlusApp/1.0' },
      timeout: 5000
    });

    if (wikiRes.data && wikiRes.data.query && wikiRes.data.query.search.length > 0) {
      const results = wikiRes.data.query.search.slice(0, 10).map(item => ({
        title: item.title,
        link: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(item.title),
        snippet: item.snippet.replace(/<[^>]*>?/gm, '')
      }));
      return res.json({ results });
    }
  } catch (err) {}

  res.status(500).json({ error: 'Aucun résultat trouvé.' });
});

// Moteur de requêtes Proxy
async function fetchAndProxy(targetUrl, res) {
  try {
    const targetObj = new URL(targetUrl);

    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': targetObj.origin + '/'
      },
      responseType: 'arraybuffer',
      validateStatus: () => true,
      timeout: 12000
    });

    const contentType = response.headers['content-type'] || '';

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);

    // Traitement CSS
    if (contentType.includes('text/css')) {
      let css = response.data.toString('utf-8');
      css = css.replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, url) => {
        if (!url || url.startsWith('data:')) return match;
        const absolute = resolveUrl(url, targetUrl);
        return 'url("/api/proxy?url=' + encodeURIComponent(absolute) + '")';
      });
      return res.send(css);
    }

    // Traitement HTML
    if (contentType.includes('text/html')) {
      let html = response.data.toString('utf-8');

      // Réécriture des attributs href, src, action
      html = html.replace(/(href|src|action)=(['"])(.*?)\2/gi, (match, attr, quote, url) => {
        if (!url || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:')) {
          return match;
        }
        const absolute = resolveUrl(url, targetUrl);
        return attr + '=' + quote + '/api/proxy?url=' + encodeURIComponent(absolute) + quote;
      });

      // Réécriture de srcset (images adaptatives)
      html = html.replace(/srcset=(['"])(.*?)\1/gi, (match, quote, srcset) => {
        const newSet = srcset.split(',').map(part => {
          const trimmed = part.trim().split(/\s+/);
          if (trimmed[0] && !trimmed[0].startsWith('data:')) {
            trimmed[0] = '/api/proxy?url=' + encodeURIComponent(resolveUrl(trimmed[0], targetUrl));
          }
          return trimmed.join(' ');
        }).join(', ');
        return 'srcset=' + quote + newSet + quote;
      });

      // Script JS d'interception globale
      const injected = `
        <base href="${targetObj.origin}/">
        <meta name="referrer" content="no-referrer">
        <script>
          (function() {
            const TARGET_URL = "${targetUrl}";
            function toProxy(u) {
              try {
                const abs = new URL(u, TARGET_URL).href;
                return '/api/proxy?url=' + encodeURIComponent(abs);
              } catch(e) { return u; }
            }
            const origFetch = window.fetch;
            window.fetch = function(r, i) {
              if (typeof r === 'string' && !r.startsWith('data:') && !r.startsWith('/api/proxy')) r = toProxy(r);
              return origFetch.call(this, r, i);
            };
            const origXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function(m, u, ...a) {
              if (typeof u === 'string' && !u.startsWith('data:') && !u.startsWith('/api/proxy')) u = toProxy(u);
              return origXHR.call(this, m, u, ...a);
            };
            document.addEventListener('click', function(e) {
              const a = e.target.closest('a');
              if (a && a.href && !a.href.startsWith('javascript:') && !a.href.includes('/api/proxy')) {
                e.preventDefault();
                window.location.href = toProxy(a.href);
              }
            }, true);
          })();
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + injected);
      } else {
        html = injected + html;
      }
      return res.send(html);
    }

    // Images / Fichiers binaires / JS
    return res.send(Buffer.from(response.data));

  } catch (err) {
    res.status(500).send('Erreur lors du chargement : ' + err.message);
  }
}

// 2. Route officielle Proxy
app.get('/api/proxy', async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }
  await fetchAndProxy(targetUrl, res);
});

// 3. Catch-All pour intercepter les images relatives ratées par le HTML
app.use(async (req, res, next) => {
  const referer = req.headers['referer'] || '';
  if (referer.includes('/api/proxy?url=')) {
    try {
      const match = referer.match(/url=([^&]+)/);
      if (match && match[1]) {
        const parentUrl = decodeURIComponent(match[1]);
        const parentObj = new URL(parentUrl);
        const missingAssetUrl = parentObj.origin + req.originalUrl;
        console.log('[PROXY RECAPTURE] Récupération de : ' + missingAssetUrl);
        return await fetchAndProxy(missingAssetUrl, res);
      }
    } catch (e) {}
  }
  next();
});

app.listen(PORT, () => {
  console.log('[SERVEUR] SAFARI + démarré sur le port ' + PORT);
});
