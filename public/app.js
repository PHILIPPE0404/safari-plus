const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

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
      params: { action: 'query', list: 'search', srsearch: query, format: 'json', origin: '*' },
      headers: { 'User-Agent': 'SafariPlusApp/2.0' },
      timeout: 5000
    });

    if (wikiRes.data?.query?.search?.length > 0) {
      const results = wikiRes.data.query.search.slice(0, 10).map(item => ({
        title: item.title,
        link: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(item.title),
        snippet: item.snippet.replace(/<[^>]*>?/gm, '')
      }));
      return res.json({ results });
    }
  } catch (err) {
    console.log('[WIKI ERREUR] ' + err.message);
  }
  res.status(500).json({ error: 'Aucun résultat.' });
});

// 2. Le Proxy principal (http-proxy-middleware)
app.use('/api/proxy', createProxyMiddleware({
  router: (req) => {
    const target = req.query.url;
    if (!target) return 'http://localhost:3000';
    try {
      return new URL(target).origin;
    } catch (err) {
      return 'http://localhost:3000';
    }
  },
  pathRewrite: (path, req) => {
    const target = req.query.url;
    if (!target) return path;
    try {
      const urlObj = new URL(target);
      return urlObj.pathname + urlObj.search;
    } catch (err) {
      return path;
    }
  },
  changeOrigin: true,
  ws: true, // Active les WebSockets (indispensable pour les jeux interactifs)
  secure: false,
  onProxyRes: (proxyRes, req, res) => {
    // Fait sauter toutes les sécurités qui bloquent l'affichage et les images
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    proxyRes.headers['access-control-allow-origin'] = '*';
  }
}));

// 3. Filet de sécurité (Catch-all) pour les images orphelines
// Intercepte les images appelées directement par la racine (ex: /logo.png) et les redirige vers le bon site
app.use((req, res, next) => {
  const referer = req.headers.referer || '';
  
  if (referer.includes('/api/proxy?url=')) {
    const match = referer.match(/url=([^&]+)/);
    if (match && match[1]) {
      try {
        const targetOrigin = new URL(decodeURIComponent(match[1])).origin;
        
        return createProxyMiddleware({
          target: targetOrigin,
          changeOrigin: true,
          secure: false,
          onProxyRes: (proxyRes) => {
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            proxyRes.headers['access-control-allow-origin'] = '*';
          },
          onError: (err, req, res) => res.status(404).end()
        })(req, res, next);
      } catch (e) {
        // Ignore l'erreur et passe au middleware suivant
      }
    }
  }
  next();
});

app.listen(PORT, () => {
  console.log(`[SERVEUR] SAFARI + démarré sur le port ${PORT}`);
});
