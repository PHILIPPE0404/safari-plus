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

// Conversion d'une URL relative en URL absolue
function resolveUrl(relativeUrl, baseUrl) {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (e) {
    return relativeUrl;
  }
}

// Route de recherche : Wikipédia FR + secours SearXNG
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Recherche vide' });

  console.log('[RECHERCHE] Query : "' + query + '"');

  // 1. Wikipédia FR
  try {
    const wikiRes = await axios.get('https://fr.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        origin: '*'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SafariPlus/1.0'
      },
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
  } catch (err) {
    console.log('[RECHERCHE] Échec Wikipédia : ' + err.message);
  }

  // 2. Instances SearXNG
  const instances = [
    'https://searx.be/search',
    'https://searx.ebinar.me/search',
    'https://searx.mrbits.it/search'
  ];

  for (const inst of instances) {
    try {
      const response = await axios.get(inst, {
        params: { q: query, format: 'json', language: 'fr-FR' },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 4000
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        const results = response.data.results.slice(0, 10).map(item => ({
          title: item.title,
          link: item.url,
          snippet: item.content || 'Aucune description disponible.'
        }));
        return res.json({ results });
      }
    } catch (e) {}
  }

  res.status(500).json({ error: 'Aucun résultat disponible.' });
});

// Proxy complet : HTML, CSS, images, requêtes JS (Fetch/XHR) et formulaires
app.get('/api/proxy', async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  console.log('[PROXY] Chargement de : ' + targetUrl);

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      responseType: 'arraybuffer',
      validateStatus: () => true,
      timeout: 12000
    });

    const contentType = response.headers['content-type'] || 'text/html';

    // Autorisations CORS & déblocage d'affichage
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);

    const targetObj = new URL(targetUrl);
    const baseUrl = targetObj.origin;

    // 1. Réécriture des images/fichiers dans les feuilles de style CSS
    if (contentType.includes('text/css')) {
      let css = response.data.toString('utf-8');
      css = css.replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, url) => {
        if (!url || url.startsWith('data:')) return match;
        const absolute = resolveUrl(url, targetUrl);
        return 'url("/api/proxy?url=' + encodeURIComponent(absolute) + '")';
      });
      return res.send(css);
    }

    // 2. Traitement des pages HTML
    if (contentType.includes('text/html')) {
      let html = response.data.toString('utf-8');

      // Réécriture des balises src, href, action
      html = html.replace(/(href|src|action)=(['"])(.*?)\2/gi, (match, attr, quote, url) => {
        if (!url || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:')) {
          return match;
        }
        const absolute = resolveUrl(url, targetUrl);
        return attr + '="/api/proxy?url=' + encodeURIComponent(absolute) + '"';
      });

      // Injection d'un moteur d'interception JavaScript dans le navigateur
      const injectedScript = `
        <base href="${baseUrl}/">
        <meta name="referrer" content="no-referrer">
        <script>
          (function() {
            const CURRENT_TARGET = "${targetUrl}";

            function toProxyUrl(url) {
              try {
                const resolved = new URL(url, CURRENT_TARGET).href;
                return '/api/proxy?url=' + encodeURIComponent(resolved);
              } catch(e) {
                return url;
              }
            }

            // Intercepter window.fetch
            const originalFetch = window.fetch;
            window.fetch = function(resource, init) {
              if (typeof resource === 'string' && !resource.startsWith('data:') && !resource.startsWith('/api/proxy')) {
                resource = toProxyUrl(resource);
              } else if (resource instanceof Request) {
                const proxiedUrl = toProxyUrl(resource.url);
                resource = new Request(proxiedUrl, resource);
              }
              return originalFetch.call(this, resource, init);
            };

            // Intercepter AJAX (XMLHttpRequest)
            const originalXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
              if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('/api/proxy')) {
                url = toProxyUrl(url);
              }
              return originalXHR.call(this, method, url, ...args);
            };

            // Intercepter les clics
            document.addEventListener('click', function(e) {
              const a = e.target.closest('a');
              if (a && a.href && !a.href.startsWith('javascript:') && !a.href.includes('/api/proxy')) {
                e.preventDefault();
                window.location.href = toProxyUrl(a.href);
              }
            }, true);

            // Intercepter l'envoi de formulaires
            document.addEventListener('submit', function(e) {
              const form = e.target;
              if (form && form.action) {
                form.action = toProxyUrl(form.action);
              }
            }, true);
          })();
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + injectedScript);
      } else {
        html = injectedScript + html;
      }

      return res.send(html);
    }

    // 3. Renvoi brut pour les images (PNG, JPG, SVG, WebP) et scripts JS
    return res.send(Buffer.from(response.data));

  } catch (err) {
    console.error('[PROXY ERROR] ' + err.message);
    res.status(500).send('Erreur lors du chargement de la page : ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log('[SERVEUR] SAFARI + démarré sur le port ' + PORT);
});
