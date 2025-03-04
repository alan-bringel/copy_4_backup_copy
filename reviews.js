/**
 * Sistema de reviews para Parallel Reading
 */

document.addEventListener('DOMContentLoaded', () => {
  initReviewSystem();
});

// Configuração
const CONFIG = {
  isDevelopment: window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1',
  reviewsEndpoint: '/api/reviews',
  localStorageKey: 'reviews',
  useFirebaseInDev: true // Usar Firebase mesmo em ambiente de desenvolvimento
};

// Sistema de fallback para quando o servidor falhar
const FirebaseFallback = {
  loadScript: async function() {
    if (this.loaded) return true;
    
    try {
      // Verificar se o script já foi carregado
      if (!document.getElementById('firebase-auth-script')) {
        const script = document.createElement('script');
        script.id = 'firebase-auth-script';
        script.type = 'module';
        script.src = './firebase-auth.js';
        document.head.appendChild(script);
        
        // Aguardar o script carregar
        await new Promise(resolve => {
          script.onload = resolve;
          script.onerror = () => {
            console.error("Falha ao carregar firebase-auth.js");
            resolve(false);
          };
        });
      }
      
      this.loaded = true;
      return true;
    } catch (error) {
      console.error("Erro ao carregar firebase-auth.js:", error);
      return false;
    }
  },
  
  addReview: async function(reviewData) {
    if (!await this.loadScript()) {
      throw new Error("Não foi possível carregar o módulo Firebase");
    }
    
    const { addReviewWithAuth } = await import('./firebase-auth.js');
    return addReviewWithAuth(reviewData);
  },
  
  getReviews: async function() {
    if (!await this.loadScript()) {
      throw new Error("Não foi possível carregar o módulo Firebase");
    }
    
    const { getReviews } = await import('./firebase-auth.js');
    return getReviews();
  }
};

// Sistema de cache para imagens de perfil
const ImageCache = {
  cache: {},
  
  // Inicializa o cache a partir do localStorage
  init: function() {
    try {
      const savedCache = localStorage.getItem('imageCache');
      if (savedCache) {
        this.cache = JSON.parse(savedCache);
      }
    } catch (e) {
      console.error("Erro ao carregar cache de imagens:", e);
    }
  },
  
  // Salva a imagem no cache
  save: function(url, dataUrl) {
    this.cache[url] = dataUrl;
    // Também salvar no localStorage para persistência
    try {
      localStorage.setItem('imageCache', JSON.stringify(this.cache));
    } catch (e) {
      console.error("Erro ao salvar cache de imagens:", e);
    }
  },
  
  // Obtém a imagem do cache
  get: function(url) {
    // Verificar primeiro na memória
    if (this.cache[url]) {
      return this.cache[url];
    }
    
    return null;
  },
  
  // Converte um blob para data URL
  _blobToDataURL: function(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
  
  // Carrega imagens externas para o cache
  loadAndCache: async function(url) {
    if (!url || url === 'undefined') {
      return null;
    }
    
    // Verificar cache primeiro
    const cached = this.get(url);
    if (cached) {
      return cached;
    }
    
    // Para URLs do Google, usar o servidor proxy
    if (url.includes('googleusercontent.com')) {
      try {
        // Tentar carregar via proxy
        const proxyUrl = `/api/google-image?url=${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos de timeout
        
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const blob = await response.blob();
          const dataUrl = await this._blobToDataURL(blob);
          this.save(url, dataUrl);
          return dataUrl;
        }
      } catch (e) {
        console.log("Proxy falhou, usando fallback para avatar:", e);
      }
      
      // Se o proxy falhar, gerar um avatar baseado no nome do usuário
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      return generateAvatarFromName(userData.name || 'User');
    }
    
    // Para URLs não-Google, usar o método existente
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      return new Promise(resolve => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          this.save(url, dataUrl);
          resolve(dataUrl);
        };
        img.onerror = () => {
          resolve(null);
        };
        img.src = url;
      });
    } catch (error) {
      console.error("Erro ao carregar imagem:", error);
      return null;
    }
  }
};

// Gerar avatar baseado no nome do usuário
function generateAvatarFromName(name) {
  // Canvas para gerar a imagem
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  
  // Gerar cor baseada no nome
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Gerar cor HSL para melhor contraste
  const h = Math.abs(hash) % 360;
  const s = 65 + Math.abs(hash % 25); // Entre 65-90% saturação
  const l = 45 + Math.abs(hash % 10); // Entre 45-55% luminosidade
  
  const bgColor = `hsl(${h}, ${s}%, ${l}%)`;
  
  // Preencher fundo com a cor gerada
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Adicionar iniciais
  ctx.fillStyle = 'white';
  ctx.font = '38px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Pegar as iniciais (primeira letra de cada palavra)
  const initials = name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
  
  ctx.fillText(initials, canvas.width/2, canvas.height/2);
  
  // Retornar como data URL
  return canvas.toDataURL('image/png');
}

// Inicialização
async function initReviewSystem() {
  // Inicializar o cache de imagens
  ImageCache.init();
  
  setupReviewUI();
  setupGoogleAuth();
  await loadReviews();
}

// Configuração da UI
function setupReviewUI() {
  const reviewButton = document.querySelector('.review-button');
  if (reviewButton) {
    reviewButton.addEventListener('click', toggleFormulario);
  }
  
  const stars = document.querySelectorAll('.stars .star');
  stars.forEach((star, index) => {
    star.addEventListener('click', () => setRating(index + 1));
  });
  
  const reviewForm = document.getElementById('review-form');
  if (reviewForm) {
    reviewForm.addEventListener('submit', submitReview);
  }
  
  checkExistingUserData();
}

// Configuração da autenticação Google
function setupGoogleAuth() {
  console.log("Configurando autenticação do Google...");
  
  const checkAndInitGoogleAPI = () => {
    if (typeof google !== 'undefined' && google.accounts) {
      console.log("API do Google disponível, inicializando...");
      
      try {
        google.accounts.id.initialize({
          client_id: "738180029480-tm4g2d6a5bvg440vitkipth7ubvhp5md.apps.googleusercontent.com",
          callback: handleCredentialResponse
        });
        
        const buttonDiv = document.getElementById("buttonDiv");
        if (buttonDiv) {
          google.accounts.id.renderButton(buttonDiv, {
            theme: "filled_white",
            type: "icon",
            shape: "pill",
            size: "large"
          });
        }
        
        const loginButton = document.getElementById('login-button');
        if (loginButton) {
          loginButton.onclick = function(e) {
            e.preventDefault();
            console.log("Botão de login clicado, iniciando prompt do Google");
            try {
              google.accounts.id.prompt();
            } catch (error) {
              console.error("Erro ao iniciar prompt do Google:", error);
            }
            return false;
          };
        }
        
        return true;
      } catch (error) {
        console.error("Erro ao inicializar API do Google:", error);
        return false;
      }
    }
    return false;
  };
  
  // Tentar inicializar imediatamente
  if (!checkAndInitGoogleAPI()) {
    // Se falhar, fazer tentativas com backoff exponencial
    let attempts = 0;
    const maxAttempts = 5;
    
    const tryAgain = () => {
      attempts++;
      if (attempts <= maxAttempts) {
        const timeout = Math.pow(2, attempts) * 500; // 1s, 2s, 4s, 8s, 16s
        console.log(`Tentativa ${attempts} de carregar API Google em ${timeout}ms`);
        
        setTimeout(() => {
          if (!checkAndInitGoogleAPI()) {
            tryAgain();
          }
        }, timeout);
      } else {
        console.error("Não foi possível carregar a API do Google após várias tentativas");
      }
    };
    
    tryAgain();
  }
}

// Verificar dados do usuário salvos
function checkExistingUserData() {
  const userData = localStorage.getItem('userData');
  if (userData) {
    try {
      const data = JSON.parse(userData);
      updateUserAvatar(data.picture);
      
      const nameInput = document.getElementById('name');
      if (nameInput) {
        nameInput.value = data.name;
        nameInput.setAttribute('data-email', data.email);
        nameInput.setAttribute('data-picture', data.picture);
      }
    } catch (e) {
      console.error("Erro ao processar dados do usuário:", e);
    }
  }
}

// Atualizar avatar do usuário
async function updateUserAvatar(pictureUrl) {
  if (!pictureUrl) return;
  
  const loginButton = document.getElementById('login-button');
  if (!loginButton) return;
  
  try {
    console.log("Atualizando avatar com URL:", pictureUrl);
    
    // Tentar usar o cache ou carregar a imagem
    let imageUrl = null;
    
    // Verificar cache primeiro
    const cachedImage = ImageCache.get(pictureUrl);
    if (cachedImage) {
      console.log("Usando imagem em cache");
      imageUrl = cachedImage;
    } else {
      console.log("Carregando imagem via proxy...");
      try {
        imageUrl = await ImageCache.loadAndCache(pictureUrl);
      } catch (err) {
        console.warn("Erro ao carregar imagem, usando URL direta:", err);
        imageUrl = pictureUrl;
      }
    }
    
    // Atualizar o botão de login com a imagem
    loginButton.innerHTML = '';
    const avatar = document.createElement('img');
    avatar.src = imageUrl || pictureUrl;
    avatar.alt = 'Avatar do usuário';
    avatar.className = 'user-avatar';
    
    // Garantir fallback em caso de erro
    avatar.onerror = () => {
      console.warn("Erro ao carregar imagem do avatar, usando fallback");
      avatar.src = '/images/login-icon.svg';
    };
    
    loginButton.appendChild(avatar);
    console.log("Avatar atualizado com sucesso");
    
  } catch (error) {
    console.error("Erro ao atualizar avatar:", error);
    // Fallback para o ícone padrão
    loginButton.innerHTML = `<img src="/images/login-icon.svg" alt="Login" class="login-icon">`;
  }
}

// Manipular resposta de login Google
function handleCredentialResponse(response) {
  const data = jwt_decode(response.credential);
  
  // Usar a versão maior da imagem de perfil (removendo =s96-c do final da URL)
  let pictureUrl = data.picture;
  if (pictureUrl && pictureUrl.includes('=s96-c')) {
    pictureUrl = pictureUrl.replace('=s96-c', '=s384-c'); // Pedir imagem maior
  }
  
  // Salvar dados de usuário
  localStorage.setItem('userData', JSON.stringify({
    name: data.name,
    email: data.email,
    picture: pictureUrl
  }));
  
  // Preencher formulário
  const nameInput = document.getElementById('name');
  if (nameInput) {
    nameInput.value = data.name;
    nameInput.setAttribute('data-email', data.email);
    nameInput.setAttribute('data-picture', pictureUrl);
  }
  
  // Exibir avatar no estilo do widget-review-main
  const loginButton = document.getElementById('login-button');
  if (loginButton) {
    const avatar = document.createElement('img');
    avatar.src = pictureUrl;
    avatar.alt = 'Avatar do usuário';
    avatar.className = 'user-avatar';
    
    // Limpar o conteúdo atual e adicionar a imagem
    loginButton.innerHTML = '';
    loginButton.appendChild(avatar);
  }
  
  // Exibir formulário
  toggleFormulario();
}

// Definir classificação por estrelas
function setRating(stars) {
  const starElements = document.querySelectorAll('.stars .star');
  starElements.forEach((star, index) => {
    if (index < stars) {
      star.textContent = '★';
      star.classList.add('checked');
    } else {
      star.textContent = '☆';
      star.classList.remove('checked');
    }
  });
  
  document.getElementById('rating').value = stars;
}

// Alternar exibição do formulário
function toggleFormulario() {
  const container = document.getElementById('containerFormulario');
  if (container) {
    if (container.style.display === 'none' || container.style.display === '') {
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  }
}

// Substituir a função submitReview

// Variável de controle para evitar envios múltiplos
let isSubmitting = false;

async function submitReview(event) {
  event.preventDefault();
  
  // Verificar se já está em processo de submissão
  if (isSubmitting) {
    console.log("Submissão já em andamento");
    return;
  }
  
  // Marcar como em processo de submissão
  isSubmitting = true;
  
  // Desabilitar o botão de envio
  const submitButton = event.target.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando...';
  }
  
  // Obter dados do formulário
  const name = document.getElementById('name').value.trim();
  const comment = document.getElementById('comment').value.trim();
  const rating = parseInt(document.getElementById('rating').value);
  
  if (!name || !comment || rating === 0) {
    alert('Por favor, preencha todos os campos e selecione uma classificação.');
    resetSubmitState(submitButton);
    return;
  }
  
  // Verificar se é um comentário duplicado
  const submissionId = `${name}_${Date.now()}`;
  const recentSubmissions = JSON.parse(localStorage.getItem('recentSubmissions') || '[]');
  
  // Verificar se há uma submissão recente com o mesmo conteúdo
  const isDuplicate = recentSubmissions.some(s => 
    s.name === name && 
    s.comment === comment && 
    Date.now() - s.timestamp < 10000 // 10 segundos
  );
  
  if (isDuplicate) {
    console.log("Detectada submissão duplicada");
    resetSubmitState(submitButton);
    return;
  }
  
  try {
    const userData = localStorage.getItem('userData');
    const userInfo = userData ? JSON.parse(userData) : {};
    
    const reviewData = {
      name,
      email: userInfo.email || '',
      comment,
      rating,
      date: new Date().toISOString(),
      picture: userInfo.picture || '',
      verified: !!userInfo.email,
      submissionId
    };
    
    // Registrar a tentativa de submissão
    recentSubmissions.push({
      name,
      comment,
      timestamp: Date.now()
    });
    
    // Manter apenas as 5 submissões mais recentes
    while (recentSubmissions.length > 5) {
      recentSubmissions.shift();
    }
    
    localStorage.setItem('recentSubmissions', JSON.stringify(recentSubmissions));
    
    // Realizar o envio
    let result;
    try {
      result = await saveReviewToAPI(reviewData);
    } catch (error) {
      console.error("Falha ao enviar pela API, tentando fallback:", error);
      result = await FirebaseFallback.addReview(reviewData);
    }
    
    if (result.success) {
      // Limpar formulário e recarregar reviews
      document.getElementById('review-form').reset();
      document.getElementById('rating').value = "0";
      setRating(0);
      toggleFormulario();
      await loadReviews();
      
      alert('Sua avaliação foi enviada com sucesso!');
    }
  } catch (error) {
    console.error("Erro ao enviar review:", error);
    alert('Ocorreu um erro ao enviar sua avaliação. Por favor, tente novamente.');
  } finally {
    resetSubmitState(submitButton);
  }
}

// Função auxiliar para resetar o estado do botão de envio
function resetSubmitState(submitButton) {
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Enviar';
  }
  setTimeout(() => {
    isSubmitting = false;
  }, 1000);
}

// Salvar avaliação na API (Firebase)
async function saveReviewToAPI(reviewData) {
  try {
    const response = await fetch(CONFIG.reviewsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reviewData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Erro ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Erro na API:', error);
    throw error;
  }
}

// Carregar avaliações
async function loadReviews() {
  try {
    let reviews = [];
    
    try {
      console.log("Carregando avaliações diretamente do Firebase...");
      reviews = await FirebaseFallback.getReviews();
      console.log(`${reviews.length} avaliações carregadas`);
      
      // Backup local para casos de falha de conexão futura
      localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(reviews));
    } catch (error) {
      console.error('Erro ao carregar do Firebase:', error);
      
      // Tentar usar dados em cache local como último recurso
      try {
        const localData = localStorage.getItem(CONFIG.localStorageKey);
        if (localData) {
          reviews = JSON.parse(localData);
          console.log(`Usando ${reviews.length} avaliações do backup local`);
        } else {
          reviews = getSampleReviews();
          console.log("Usando avaliações de exemplo");
        }
      } catch (e) {
        console.error("Erro ao usar cache local:", e);
        reviews = getSampleReviews();
      }
    }
    
    displayReviews(reviews);
  } catch (error) {
    console.error('Erro crítico ao carregar avaliações:', error);
    displayEmptyState();
  }
}

// Exibir avaliações
function displayReviews(reviews) {
  const container = document.getElementById('response-output');
  if (!container) return;
  
  ensureReviewsStructure(container);
  
  const reviewsList = container.querySelector('.reviews-list');
  if (!reviewsList) return;
  
  reviewsList.innerHTML = '';
  
  if (!reviews || reviews.length === 0) {
    displayEmptyState();
    return;
  }
  
  reviews.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  reviews.forEach(review => {
    const reviewElement = document.createElement('div');
    reviewElement.className = 'review';
    
    // Formatar data
    const reviewDate = new Date(review.date);
    const formattedDate = reviewDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    
    // Primeiro usar o ícone padrão enquanto carrega
    reviewElement.innerHTML = `
      <div class="circle-border2"></div> 
      <div class="circle-border"></div>
      <div class="circle" style="background-image: url('/images/login-icon.svg')"></div>
      <div class="stars">
        ${'★'.repeat(review.rating)}
        ${'☆'.repeat(5 - review.rating)}
      </div>
      <p class="name-date">${review.name} ${review.verified ? '<span class="verified-icon"></span>' : ''}</p>
      <p class="date">${formattedDate}</p>
      <p class="comment">${review.comment}</p>
    `;
    
    reviewsList.appendChild(reviewElement);
    
    // Processar a imagem em segundo plano
    if (review.picture) {
      const circleElement = reviewElement.querySelector('.circle');
      
      // Verificar cache
      const cachedImage = ImageCache.get(review.picture);
      if (cachedImage) {
        circleElement.style.backgroundImage = `url('${cachedImage}')`;
        circleElement.classList.add('image-loaded');
      } else {
        // Tratar URLs do Google de forma especial
        if (review.picture.includes('googleusercontent.com')) {
          // Modificar URL para usar uma versão maior (melhor qualidade)
          let optimizedUrl = review.picture;
          if (optimizedUrl.includes('=s96-c')) {
            optimizedUrl = optimizedUrl.replace('=s96-c', '=s384-c');
          }
          
          // Tentar carregar via proxy otimizado para Google
          const proxyUrl = `/google-image-proxy?url=${encodeURIComponent(optimizedUrl)}`;
          
          // Pré-carregar para verificar se funciona
          const testImg = new Image();
          testImg.onload = () => {
            circleElement.style.backgroundImage = `url('${proxyUrl}')`;
            circleElement.classList.add('image-loaded');
            
            // Também carregar para o cache para uso futuro
            ImageCache.loadAndCache(optimizedUrl);
          };
          testImg.onerror = () => {
            // Fallback: carregar normalmente ou gerar avatar
            ImageCache.loadAndCache(review.picture)
              .then(imageUrl => {
                if (imageUrl && imageUrl !== '/images/login-icon.svg') {
                  circleElement.style.backgroundImage = `url('${imageUrl}')`;
                  circleElement.classList.add('image-loaded');
                } else {
                  // Usar avatar gerado
                  const generatedAvatar = generateAvatarFromName(review.name);
                  circleElement.style.backgroundImage = `url('${generatedAvatar}')`;
                  circleElement.classList.add('image-loaded');
                }
              })
              .catch(() => {
                const generatedAvatar = generateAvatarFromName(review.name);
                circleElement.style.backgroundImage = `url('${generatedAvatar}')`;
                circleElement.classList.add('image-loaded');
              });
          };
          testImg.src = proxyUrl;
        } else {
          // Para outras imagens, usar o método padrão
          ImageCache.loadAndCache(review.picture)
            .then(imageUrl => {
              circleElement.style.backgroundImage = `url('${imageUrl}')`;
              circleElement.classList.add('image-loaded');
            })
            .catch(() => {
              const generatedAvatar = generateAvatarFromName(review.name);
              circleElement.style.backgroundImage = `url('${generatedAvatar}')`;
              circleElement.classList.add('image-loaded');
            });
        }
      }
    } else if (review.name) {
      // Se não tiver imagem mas tiver nome, gerar avatar
      const circleElement = reviewElement.querySelector('.circle');
      const generatedAvatar = generateAvatarFromName(review.name);
      circleElement.style.backgroundImage = `url('${generatedAvatar}')`;
      circleElement.classList.add('image-loaded');
    }
  });
  
  updateStatistics(reviews);
}

// Garantir que a estrutura da seção de reviews exista
function ensureReviewsStructure(container) {
  if (!container.querySelector('.estatisticas-header')) {
    container.innerHTML = `
      <div class="estatisticas-header">  
        <h2>Resumo Reviews</h2>
        <div class="barras-container">
          <div class="barra-container">
            <div class="barra-avaliacao">
              <div class="cinco-estrelas"></div>
            </div>
            <p class="numero-barra-5">5</p>
          </div>
          <div class="barra-container">
            <div class="barra-avaliacao">
              <div class="quatro-estrelas"></div>
            </div>
            <p class="numero-barra-4">4</p>
          </div>
          <div class="barra-container">
            <div class="barra-avaliacao">
              <div class="tres-estrelas"></div>
            </div>
            <p class="numero-barra-3">3</p>
          </div>
          <div class="barra-container">
            <div class="barra-avaliacao">
              <div class="duas-estrelas"></div>
            </div>
            <p class="numero-barra-2">2</p>
          </div>
          <div class="barra-container">
            <div class="barra-avaliacao">
              <div class="uma-estrela"></div>
            </div>
            <p class="numero-barra-1">1</p>
          </div>
        </div>
        
        <div class="rating-summary">
          <h3 id="total-rating">0.0</h3>
          <div class="star-rating-container">
            <img id="star-rating-image" src="images/estrelas/estrela-vazia.png" alt="Avaliação de 0 estrelas">
          </div>
          <p class="numero-total-de-reviews" id="total-reviews">0 reviews</p>
        </div>
      </div>
      <div class="reviews-list"></div>
    `;
  }
}

// Exibir estado vazio
function displayEmptyState() {
  const container = document.getElementById('response-output');
  if (!container) return;
  
  ensureReviewsStructure(container);
  
  const reviewsList = container.querySelector('.reviews-list');
  if (reviewsList) {
    reviewsList.innerHTML = '<p>Ainda não há avaliações. Seja o primeiro a avaliar!</p>';
  }
  
  resetStatistics();
}

// Atualizar estatísticas
function updateStatistics(reviews) {
  const counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  let sum = 0;
  
  reviews.forEach(review => {
    const rating = parseInt(review.rating);
    if (rating >= 1 && rating <= 5) {
      counts[rating]++;
      sum += rating;
    }
  });
  
  const total = reviews.length;
  const average = total > 0 ? sum / total : 0;
  
  // Atualizar média
  const totalRatingElement = document.getElementById('total-rating');
  if (totalRatingElement) {
    totalRatingElement.textContent = average.toFixed(1);
  }
  
  // Atualizar contagem
  const totalReviewsElement = document.getElementById('total-reviews');
  if (totalReviewsElement) {
    totalReviewsElement.textContent = `${total} review${total !== 1 ? 's' : ''}`;
  }
  
  // Atualizar barras
  const maxCount = Math.max(...Object.values(counts));
  for (let i = 1; i <= 5; i++) {
    const percentage = maxCount > 0 ? (counts[i] / maxCount) * 100 : 0;
    updateBar(i, percentage);
  }
  
  // Atualizar imagem de estrelas
  updateStarImage(average);
}

// Atualizar barras de estatísticas
function updateBar(stars, percentage) {
  const classNames = {
    1: 'uma-estrela',
    2: 'duas-estrelas',
    3: 'tres-estrelas',
    4: 'quatro-estrelas',
    5: 'cinco-estrelas'
  };
  
  const bar = document.querySelector(`.${classNames[stars]}`);
  if (bar) {
    bar.style.width = `${percentage}%`;
  }
}

// Atualizar imagem de estrelas
function updateStarImage(rating) {
  const starImage = document.getElementById('star-rating-image');
  if (!starImage) return;
  
  let imageName;
  
  if (rating === 0) {
    imageName = 'estrela-vazia.png';
  } else {
    // Arredondar para o meio mais próximo (0, 0.5, 1, 1.5, etc)
    const roundedRating = Math.round(rating * 10) / 10;
    // Formatar para o nome do arquivo (por exemplo: estrela1.0.png)
    imageName = `estrela${roundedRating.toFixed(1)}.png`;
  }
  
  // Caminho completo para a imagem
  const imagePath = `/images/estrelas/${imageName}`;
  starImage.src = imagePath;
  starImage.alt = `Avaliação de ${rating.toFixed(1)} estrelas`;
  
  // Adicionar handler de erro para caso a imagem não exista
  starImage.onerror = function() {
    this.src = '/images/estrelas/estrela-vazia.png';
        console.warn('Imagem de estrela não encontrada:', imagePath);
      };
    }

// Gerar avaliações de exemplo
function getSampleReviews() {
  return [
    {
      id: "example1",
      name: "Maria Silva",
      email: "maria@example.com",
      rating: 5,
      comment: "Excelente aplicativo para estudar a Bíblia e aprender inglês simultaneamente!",
      date: new Date().toISOString(),
      picture: "/images/avatar-woman.jpg",
      verified: true
    },
    {
      id: "example2",
      name: "João Santos",
      email: "joao@example.com",
      rating: 4,
      comment: "Muito útil e bem projetado. A interface é intuitiva e fácil de usar.",
      date: new Date(Date.now() - 86400000).toISOString(),
      picture: "/images/avatar-man.jpg",
      verified: true
    }
  ];
}

// Resetar estatísticas
function resetStatistics() {
  const totalRatingElement = document.getElementById('total-rating');
  if (totalRatingElement) {
    totalRatingElement.textContent = '0.0';
  }
  
  const barElements = document.querySelectorAll('.barra-avaliacao > div');
  barElements.forEach(bar => {
    bar.style.width = '0%';
  });
  
  const totalReviewsElement = document.getElementById('total-reviews');
  if (totalReviewsElement) {
    totalReviewsElement.textContent = '0 reviews';
  }
  
  const starImageContainer = document.getElementById('star-rating-image');
  if (starImageContainer) {
    starImageContainer.setAttribute('src', '/images/estrelas/estrela-vazia.png');
  }
}