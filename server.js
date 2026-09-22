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

// 1. Route de recherche Wikipédia
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

// 2. Proxy Streaming (Transfert binaire direct des images)
app.get('/api/proxy', async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const targetObj = new URL(targetUrl);

    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': targetObj.origin + '/'
      },
      responseType: 'stream',
      validateStatus: () => true,
      timeout: 12000
    });

    const contentType = response.headers['content-type'] || '';

    // Déblocage des sécurités d'affichage
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');

    // Traitement uniquement pour le HTML
    if (contentType.includes('text/html')) {
      let chunks = [];
      response.data.on('data', chunk => chunks.push(chunk));
      response.data.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf-8');

        const injected = `
          <base href="${targetObj.origin}/">
          <meta name="referrer" content="no-referrer">
          <script>
            (function() {
              const TARGET = "${targetUrl}";
              function toProxy(u) {
                try {
                  const abs = new URL(u, TARGET).href;
                  return '/api/proxy?url=' + encodeURIComponent(abs);
                } catch(e) { return u; }
              }
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
        res.send(html);
      });
      return;
    }

    // Pour TOUTES les images (PNG, WebP, SVG, JPG) et assets : envoi en flux direct
    response.data.pipe(res);

  } catch (err) {
    res.status(500).send('Erreur proxy : ' + err.message);
  }
});

// 3. Intercepteur pour les images relatives appelées directement par la page
app.use(async (req, res, next) => {
  const referer = req.headers['referer'] || '';
  if (referer.includes('/api/proxy?url=')) {
    try {
      const match = referer.match(/url=([^&]+)/);
      if (match && match[1]) {
        const parentUrl = decodeURIComponent(match[1]);
        const parentObj = new URL(parentUrl);
        const missingAssetUrl = parentObj.origin + req.originalUrl;

        const streamRes = await axios({
          method: 'get',
          url: missingAssetUrl,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': parentObj.origin + '/'
          },
          responseType: 'stream',
          validateStatus: () => true
        });

        res.setHeader('Content-Type', streamRes.headers['content-type'] || 'image/png');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return streamRes.data.pipe(res);
      }
    } catch (e) {}
  }
  next();
});

app.listen(PORT, () => {
  console.log('[SERVEUR] SAFARI + démarré sur le port ' + PORT);
});
