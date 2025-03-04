import express from 'express';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https'; // Adicionar importação do HTTPS
import fs from 'fs'; // Para ler os arquivos de certificado
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Não é necessário alterar as importações relativas como:
import firebaseConfig from './firebase-config.js';
// Elas continuarão funcionando quando todos os arquivos estiverem no mesmo nível

const app = express();
// Configurar múltiplas portas
const PORTS = [80, 8080, 8888]; // Portas HTTP
const HTTPS_PORT = 8443; // Porta para HTTPS
const WRANGLER_PORT = 8787; // Porta padrão do Wrangler

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Opções do certificado SSL
// Para desenvolvimento, podemos usar certificados auto-assinados
const options = {
  key: fs.readFileSync(path.join(__dirname, 'localhost.key')),
  cert: fs.readFileSync(path.join(__dirname, 'localhost.crt'))
};

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname)));

// Configure o middleware CORS antes das outras rotas
app.use(cors());
app.use(express.json());

// Proxy para as funções Cloudflare em /api/*
app.use('/api', createProxyMiddleware({
  target: `http://localhost:${WRANGLER_PORT}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api' // Sem alteração nos caminhos
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Erro ao conectar ao Wrangler' });
  }
}));

// Proxy para as funções Cloudflare em /api/*
app.use('/api/reviews', (req, res) => {
  // Implementação direta usando o Firebase Client durante desenvolvimento
  if (req.method === 'GET') {
    // Importar dinamicamente o firebase-client.js
    import('./firebase-client.js')
      .then(module => {
        module.getReviews()
          .then(reviews => res.json(reviews))
          .catch(error => {
            console.error('Erro ao buscar reviews:', error);
            res.status(500).json({ error: error.message });
          });
      })
      .catch(error => {
        console.error('Erro ao importar módulo Firebase:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      });
  } 
  else if (req.method === 'POST') {
    // Implementação direta para POST
    import('./firebase-client.js')
      .then(module => {
        module.addReview(req.body)
          .then(result => res.status(201).json(result))
          .catch(error => {
            console.error('Erro ao adicionar review:', error);
            res.status(500).json({ error: error.message });
          });
      })
      .catch(error => {
        console.error('Erro ao importar módulo Firebase:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
      });
  } 
  else {
    res.status(405).json({ error: 'Método não suportado' });
  }
});

// Serve the lesson.html file for the root URL
app.get('/lesson.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lesson.html'));
});

// Serve os arquivos de áudio
app.get('/audios/:psalm/:file', (req, res) => {
    const { psalm, file } = req.params;
    const filePath = path.join(__dirname, 'audios', psalm, file);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Erro ao enviar o arquivo: ${filePath}`, err);
            res.status(404).send('Arquivo não encontrado');
        }
    });
});

// Serve os arquivos SRT
app.get('/subtitles/:psalm/:file', (req, res) => {
    const { psalm, file } = req.params;
    const filePath = path.join(__dirname, 'subtitles', psalm, file);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Erro ao enviar o arquivo: ${filePath}`, err);
            res.status(404).send('Arquivo não encontrado');
        }
    });
});

// Adicione este middleware para processar pedidos de proxy para imagens externas
app.get('/proxy-image', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        if (!imageUrl) {
            return res.status(400).send('URL de imagem não fornecida');
        }
        
        const response = await fetch(imageUrl);
        if (!response.ok) {
            return res.status(response.status).send('Erro ao buscar imagem');
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
    } catch (error) {
        console.error('Erro ao proxy de imagem:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

// Melhorar o proxy de imagens
app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).send('URL de imagem não fornecida');
    }
    
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).send('Erro ao buscar imagem');
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // Adicionar cabeçalhos para CORS e cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error) {
    console.error('Erro ao proxy de imagem:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Adicione este endpoint otimizado para imagens do Google

// Proxy específico para imagens do Google
app.get('/google-image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl || !imageUrl.includes('googleusercontent.com')) {
      return res.status(400).send('URL inválida');
    }
    
    // Usar headers específicos para o Google
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://accounts.google.com/'
      }
    });
    
    if (!response.ok) {
      console.error(`Erro ao buscar imagem do Google: ${response.status}`);
      return res.redirect('/images/login-icon.svg');
    }
    
    // Adicionar cache agressivo para evitar múltiplas requisições
    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 24 horas
    
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Erro no proxy de imagem do Google:', error);
    res.redirect('/images/login-icon.svg');
  }
});

// Adicione após o endpoint existente google-image-proxy

// API endpoint para facilitar acesso às imagens do Google
app.get('/api/google-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl || !imageUrl.includes('googleusercontent.com')) {
      return res.status(400).send('URL inválida ou não é do Google');
    }
    
    // Implementar sistema de retry com backoff
    let attempts = 0;
    const maxAttempts = 3;
    let delay = 500;
    let response = null;
    
    while (attempts < maxAttempts) {
      try {
        response = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://accounts.google.com/'
          },
          timeout: 5000
        });
        
        if (response.ok) break;
        
        // Se não for bem-sucedido, aumentar o delay e tentar novamente
        attempts++;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // Backoff exponencial
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) throw err;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
    
    if (!response || !response.ok) {
      throw new Error(`Falha após ${maxAttempts} tentativas`);
    }
    
    // Configurar cache agressivo e headers de resposta
    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // Cache por 24 horas
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Erro no proxy de imagem do Google:', error);
    return res.status(504).send('Tempo limite esgotado ao buscar imagem');
  }
});

// Rota para proxy específico do Firestore (para resolver problemas de CORS)
app.use('/firestore-proxy', async (req, res) => {
  try {
    // Extrair URL do Firestore original dos parâmetros
    const originalUrl = req.query.url;
    if (!originalUrl || !originalUrl.includes('firestore.googleapis.com')) {
      return res.status(400).send('URL inválida ou não é do Firestore');
    }
    
    // Headers para proxying efetivo
    const headers = {
      'Origin': 'https://parallel-reading.netlify.app',
      'User-Agent': req.headers['user-agent'],
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers['accept'] || '*/*'
    };
    
    // Copiar o método e o corpo da requisição original
    const fetchOptions = {
      method: req.method,
      headers: headers
    };
    
    // Adicionar corpo se necessário
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }
    
    // Fazer a requisição para o Firestore
    const response = await fetch(originalUrl, fetchOptions);
    
    // Reenviar status e headers
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // Adicionar headers CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Enviar o corpo da resposta
    const data = await response.arrayBuffer();
    res.send(Buffer.from(data));
  } catch (error) {
    console.error('Erro no proxy do Firestore:', error);
    res.status(500).json({
      error: 'Erro ao proxying para Firestore',
      message: error.message
    });
  }
});

// Rota para callback do Google OAuth
app.get('/callback', (req, res) => {
    res.send('Login processado com sucesso!');
});

// Iniciar servidores HTTP em múltiplas portas
PORTS.forEach(port => {
    try {
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(chalk.green(`HTTP server running on port ${port}`));
            console.log(chalk.blue(`Running on http://127.0.0.1:${port}`));
            console.log(chalk.blue(`Running on http://localhost:${port}`));
        });
    } catch (error) {
        console.error(chalk.red(`Failed to start server on port ${port}: ${error.message}`));
    }
});

// Iniciar o servidor HTTPS
try {
    const httpsServer = https.createServer(options, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(chalk.green(`HTTPS server running on port ${HTTPS_PORT}`));
        console.log(chalk.blue(`Running on https://127.0.0.1:${HTTPS_PORT}`));
        console.log(chalk.blue(`Running on https://localhost:${HTTPS_PORT}`));
    });
} catch (error) {
    console.error(chalk.red(`Failed to start HTTPS server: ${error.message}`));
}

// Enable debug mode
if (process.env.NODE_ENV !== 'production') {
    console.log(chalk.red('Debug mode: on'));
}