const express = require('express');
const axios = require('axios');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Capture toutes les erreurs fatales non gérées pour les afficher dans les logs Render
process.on('uncaughtException', (err) => {
  console.error('[CRASH ERREUR NON CAPTURÉE]', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH PROMESSE REJETÉE]', reason);
});

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

// 2. Proxy principal (avec target obligatoire et logs debug)
app.use('/api/proxy', createProxyMiddleware({
  target: 'https://www.google.com', // Cible par défaut indispensable pour éviter le crash
  changeOrigin: true,
  logLevel: 'debug', // Force l'affichage des logs du proxy sur Render
  ws: true,
  secure: false,
  router: (req) => {
    const target = req.query.url;
    if (!target) return 'https://www.google.com';
    try {
      const formattedUrl = target.startsWith('http') ? target : 'https://' + target;
      return new URL(formattedUrl).origin;
    } catch (err) {
      console.error('[ROUTER ERREUR]', err.message);
      return 'https://www.google.com';
    }
  },
  pathRewrite: (pathStr, req) => {
    const target = req.query.url;
    if (!target) return pathStr;
    try {
      const formattedUrl = target.startsWith('http') ? target : 'https://' + target;
      const urlObj = new URL(formattedUrl);
      return urlObj.pathname + urlObj.search;
    } catch (err) {
      return pathStr;
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    proxyRes.headers['access-control-allow-origin'] = '*';
  },
  onError: (err, req, res) => {
    console.error('[PROXY ERREUR HARDFALL]', err.message);
    if (!res.headersSent) {
      res.status(500).send('Erreur lors du chargement de la page : ' + err.message);
    }
  }
}));

// 3. Catch-all pour intercepter les images appelées en chemin relatif
app.use((req, res, next) => {
  const referer = req.headers.referer || '';
  
  if (referer.includes('/api/proxy?url=')) {
    const match = referer.match(/url=([^&]+)/);
    if (match && match[1]) {
      try {
        const decodedUrl = decodeURIComponent(match[1]);
        const formattedUrl = decodedUrl.startsWith('http') ? decodedUrl : 'https://' + decodedUrl;
        const targetOrigin = new URL(formattedUrl).origin;
        
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
        console.error('[CATCH-ALL ERREUR]', e.message);
      }
    }
  }
  next();
});

app.listen(PORT, () => {
  console.log(`[SERVEUR] SAFARI + démarré avec succès sur le port ${PORT}`);
});
