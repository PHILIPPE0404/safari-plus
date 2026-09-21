const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Middleware de journalisation (logs Render)
app.use((req, res, next) => {
  console.log(`[LOG ${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API de recherche avec logs détaillés
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    console.log('[SEARCH WARNING] Requête vide reçue.');
    return res.status(400).json({ error: 'Recherche vide' });
  }

  console.log(`[SEARCH] Recherche lancée pour : "${query}"`);

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.result').each((i, element) => {
      const title = $(element).find('.result__title a').text().trim();
      const link = $(element).find('.result__url').attr('href') \vert{}\vert{}$(element).find('.result__title a').attr('href');
      const snippet = $(element).find('.result__snippet').text().trim();

      if (title && link) {
        results.push({ title, link, snippet });
      }
    });

    console.log(`[SEARCH SUCCESS] ${results.length} résultats trouvés pour "${query}".`);
    res.json({ results });
  } catch (error) {
    console.error(`[SEARCH ERROR] Échec de la recherche : ${error.message}`);
    res.status(500).json({ error: 'Erreur lors de la recherche.', details: error.message });
  }
});

// Proxy avec injection de la balise <base> pour fixer les images et styles
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    console.log('[PROXY WARNING] URL manquante.');
    return res.status(400).send('URL manquante');
  }

  console.log(`[PROXY] Chargement de l'URL : ${targetUrl}`);

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      responseType: 'text',
      timeout: 10000
    });

    let html = response.data;
    const urlObj = new URL(targetUrl);
    const origin = urlObj.origin;

    // Injection de la balise <base> pour résoudre les liens et images relatifs
    const baseTag = `<base href="${origin}/">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.send(html);
    console.log(`[PROXY SUCCESS] Page envoyée avec succès : ${targetUrl}`);
  } catch (err) {
    console.error(`[PROXY ERROR] Échec sur ${targetUrl} : ${err.message}`);
    res.status(500).send(`Impossible de charger la page : ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`[SERVER] Serveur SAFARI + démarré sur le port ${PORT}`);
});
