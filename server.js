const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Log simple des requêtes
app.use((req, res, next) => {
  console.log(`[LOG] ${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
  next();
});

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

    if (wikiRes.data && wikiRes.data.query && wikiRes.data.query.search) {
      const results = wikiRes.data.query.search.slice(0, 10).map(item => ({
        title: item.title,
        link: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(item.title),
        snippet: item.snippet.replace(/<[^>]*>?/gm, '')
      }));
      return res.json({ results });
    }
  } catch (err) {
    console.error('[ERREUR RECHERCHE]', err.message);
  }
  res.status(500).json({ error: 'Aucun résultat trouvé.' });
});

// 2. Proxy Web complet
app.get('/api/proxy', async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const parsedUrl = new URL(targetUrl);

    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': parsedUrl.origin + '/'
      },
      responseType: 'arraybuffer',
      validateStatus: () => true,
      timeout: 10000
    });

    const contentType = response.headers['content-type'] || 'text/html';

    // Déblocage des protections d'affichage
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    // Traitement des pages HTML
    if (contentType.includes('text/html')) {
      let html = response.data.toString('utf-8');

      const injectedScript = `
        <base href="${parsedUrl.origin}/">
        <meta name="referrer" content="no-referrer">
        <script>
          document.addEventListener('click', function(e) {
            const a = e.target.closest('a');
            if (a && a.href && !a.href.startsWith('javascript:')) {
              e.preventDefault();
              window.location.href = '/api/proxy?url=' + encodeURIComponent(a.href);
            }
          }, true);
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + injectedScript);
      } else {
        html = injectedScript + html;
      }

      return res.send(html);
    }

    // Renvoi des images, scripts et styles en binaire brut
    return res.send(Buffer.from(response.data));

  } catch (err) {
    console.error('[ERREUR PROXY]', err.message);
    return res.status(500).send('Erreur lors du chargement de la page : ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log('[SERVEUR] Safari+ démarré sur le port ' + PORT);
});
