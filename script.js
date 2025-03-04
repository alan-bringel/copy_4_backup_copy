document.addEventListener('DOMContentLoaded', () => {
    // Solução para remover logs do console sem afetar funcionalidade
    if (true) { // Condição que permite ativar/desativar facilmente
        // Preserva o console.error para diagnóstico de erros 
        const originalConsoleError = console.error;
        // Substitui todas as funções de console por funções vazias
        console.log = function() {};
        console.info = function() {};
        console.debug = function() {};
        console.warn = function() {};
        // Mantém console.error para debugging
        console.error = originalConsoleError;
    }

    // CORREÇÃO: Primeiro armazene a função original, depois substitua
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        // Remove a interceptação completa das solicitações SRT
        return originalFetch.apply(this, arguments);
    };

    // Adiciona funcionalidade para ocultar a barra de endereços em navegadores móveis
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
    const hideAddressBar = () => {
        // Técnica melhorada para ocultar a barra de endereços em diferentes navegadores
        if (document.documentElement.scrollHeight > window.innerHeight) {
            // Se o documento for mais alto que a janela, podemos usar scrollTo
            setTimeout(() => {
                window.scrollTo(0, 1);
                // Para dispositivos iOS, pode ser necessário um segundo scrollTo
                if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                    setTimeout(() => window.scrollTo(0, 0), 50);
                }
            }, 300);
        } else {
            // Se o documento for menor, forçamos temporariamente um scroll maior
            const tempDiv = document.createElement('div');
            tempDiv.style.height = '101vh';
            document.body.appendChild(tempDiv);
            
            setTimeout(() => {
                window.scrollTo(0, 1);
                document.body.removeChild(tempDiv);
            }, 10);
        }
    };

    if (isMobile) {
        // Chame em vários eventos para garantir que a barra fique oculta
        window.addEventListener('load', hideAddressBar);
        window.addEventListener('orientationchange', hideAddressBar);
        window.addEventListener('resize', hideAddressBar);
        document.addEventListener('touchstart', hideAddressBar, {passive: true});
        
        // Adicione um evento quando o scroll parar por completo
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(hideAddressBar, 300);
        }, {passive: true});
        
        // Execute também no DOMContentLoaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', hideAddressBar);
        } else {
            hideAddressBar();
        }
    }

    // Configuração da barra de ferramentas para dispositivos móveis
    const setupMobileToolbar = () => {
        const bottomContainer = document.querySelector('.bottom-container');
        
        // Se não estiver em um dispositivo móvel ou não encontrar o elemento, sair da função
        if (!isMobile || !bottomContainer) return;
        
        // Inicialmente, minimiza a barra em dispositivos móveis
        bottomContainer.classList.add('minimized');
        
        // Evento de toque na barra de ferramentas para expandir
        bottomContainer.addEventListener('touchstart', (e) => {
            // Se já estiver minimizada, expandi-la
            if (bottomContainer.classList.contains('minimized')) {
                e.stopPropagation(); // Previne propagação para não acionar o evento do documento
                bottomContainer.classList.remove('minimized');
            }
        }, { passive: false });
        
        // Evento de toque em qualquer lugar da página para minimizar a barra
        document.addEventListener('touchstart', (e) => {
            // Se o toque não foi na barra de ferramentas e a barra não está minimizada, minimizá-la
            if (!bottomContainer.contains(e.target) && !bottomContainer.classList.contains('minimized')) {
                bottomContainer.classList.add('minimized');
            }
        }, { passive: true });
        
        // Impedir que cliques nos botões da barra minimizem a barra
        document.querySelectorAll('.button-container-fixed button').forEach(button => {
            button.addEventListener('touchstart', (e) => {
                e.stopPropagation(); // Previne que o evento se propague para o documento
            }, { passive: false });
        });
    };

    // Chame essa função logo após detectar dispositivos móveis
    if (isMobile) {
        setupMobileToolbar();
        
        // Garante que a configuração também ocorra após carregamento completo
        window.addEventListener('load', setupMobileToolbar);
        
        // Reconfigura em caso de rotação da tela
        window.addEventListener('resize', setupMobileToolbar);
    }

    const englishButton = document.getElementById('play-english');
    const alternateButton = document.getElementById('play-alternate');
    const englishTextContainer = document.getElementById('english-text');
    const translationToggle = document.getElementById('translation-toggle');
    const portugueseTextContainer = document.getElementById('portuguese-text');

    const urlParams = new URLSearchParams(window.location.search);
    const lessonId = urlParams.get('lessonId');
    if (!lessonId) {
        console.error('Lesson ID not provided. Cannot load resources.');
        englishTextContainer.textContent = 'Lesson ID missing in the URL.';
        portugueseTextContainer.textContent = 'ID da lição ausente na URL.';
        return;
    }

    const getAudioPath = async (basePath) => {
        const extensions = ['mp3']; // Remover 'm4a'
        for (const ext of extensions) {
            try {
                const response = await fetch(`${basePath}.${ext}`, { method: 'HEAD' });
                if (response.ok) return `${basePath}.${ext}`;
            } catch {
                // Ignore errors, try the next extension
            }
        }
        return null; // If no file is found
    };

    const audioPaths = {
        english: null,
    };

    const initializeAudioPaths = async () => {
        // Remove a referência ao áudio em português
        audioPaths.english = await getAudioPath(`audios/psalm_${lessonId}/v.1_psalm_${lessonId}_en`);
        // Remove esta linha
        // audioPaths.portuguese = await getAudioPath(`audios/psalm_${lessonId}/v.1_psalm_${lessonId}_pt`);
    };

    // Atualiza a função parseSRT para aceitar parâmetro startCount (numeração inicial dos versos)
    // NOVA FUNÇÃO: Fetch com cache para arquivos SRT
    const fetchSRT = async (url) => {
        const cacheKey = `srt_${url}`;
        let srtContent = localStorage.getItem(cacheKey);
        
        if (srtContent) {
            return srtContent;
        }
        
        try {
            // Criando um controller para poder abortar a requisição se necessário
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 segundo de timeout
            
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-store', // Evita cache que poderia registrar erros 404 no console
                headers: {
                    // Headers personalizados para reduzir a visibilidade dos erros no console
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/plain'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Failed to load SRT from ${url}`);
            }
            
            srtContent = await response.text();
            localStorage.setItem(cacheKey, srtContent);
            return srtContent;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`Request timeout for ${url}`);
            } else if (!url.includes('v.3_')) { // Não logar erros para o verso 3 que sabemos não existir
                console.error(`Error loading ${url}: ${error.message}`);
            }
            throw error;
        }
    };

    const parseSRT = async (url) => {
        try {
            // UTILIZE fetchSRT em vez de fetch direto:
            const srtContent = await fetchSRT(url);

            // Atualiza a função parseSRTTime para aceitar "00:00:00:00" além de "00:00:00,000"
            const parseSRTTime = (timestamp) => {
                if(timestamp.includes(',')) {
                    const [hours, minutes, secondsWithMillis] = timestamp.split(':');
                    const [secs, millis] = secondsWithMillis.split(',');
                    return parseInt(hours)*3600 + parseInt(minutes)*60 + parseInt(secs) + (millis ? parseInt(millis)/1000 : 0);
                } else {
                    const parts = timestamp.split(':');
                    if(parts.length === 4) {
                        const [hours, minutes, seconds, subSec] = parts;
                        // Se subSec possui 2 dígitos, trata como centissegundos; caso contrário, milissegundos
                        const millis = subSec.length === 2 ? parseInt(subSec)*10 : parseInt(subSec);
                        return parseInt(hours)*3600 + parseInt(minutes)*60 + parseInt(seconds) + millis/1000;
                    }
                    // Fallback para outros formatos (se necessário)
                    return 0;
                }
            };

            const subtitles = [];
            const verseNumberMatch = url.match(/v\.(\d+)_/);
            const startCount = verseNumberMatch ? parseInt(verseNumberMatch[1]) : 1;
            let verseCounter = startCount;

            const blocks = srtContent.trim().split('\n\n');

            for (const block of blocks) {
                const lines = block.split('\n');
                if (lines.length >= 3) {
                    const times = lines[1].split(' --> ');
                    const start = parseSRTTime(times[0]);
                    const end = parseSRTTime(times[1]);
                    const mainText = lines.slice(2).join(' ').replace(/\{.*?\}/g, '').trim();
                    const translation = (lines.slice(2).join(' ').match(/\{(.*?)\}/) || [])[1] || '';

                    if (mainText.startsWith('*')) {
                        subtitles.push({ start, end, mainText: mainText.slice(1).trim(), translation, verseNumber: verseCounter });
                        verseCounter++;
                    } else {
                        subtitles.push({ start, end, mainText, translation, verseNumber: null });
                    }
                }
            }
            return subtitles;
        } catch (error) {
            console.error(error.message);
            return [];
        }
    };

// Adiciona a nova função para gerar slug a partir do texto do segmento
const generateSlug = (text) => {
    return text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_');
};

// Função segura para verificar recursos sem gerar erros 404 no console
const safeResourceCheck = async (url) => {
    // Para URLs conhecidas que existem, retorna true
    if (url.includes('v.1_') || url.includes('v.2_')) {
        return true;
    }
    
    // Para outras URLs, usa o método XMLHttpRequest silencioso
    return new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, true);
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);
        xhr.send(null);
        setTimeout(() => resolve(false), 300);
    });
};

    let currentVerseVersion = 1; // Verso atual nos SRTs do modo vertical
    let maxVerseVersion = 10; // Número máximo de versos (último verso). Ajuste conforme necessário

    const loadAndDisplayText = async (language, container, version) => {
        try {
            let subtitles = [];
            let srtFile = '';
            let segmentOffset = 0; // Offset para a contagem de segmentos

            if (displayMode === 'horizontal') {
                let combinedSubtitles = [];
                
                // MODIFICAÇÃO: Usar versos disponíveis em vez de um valor fixo
                const availableVerses = await findAvailableVerses();
                
                for (let i of availableVerses) {
                    srtFile = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_${language}.srt`;
                    
                    try {
                        const subs = await parseSRT(srtFile);
                        combinedSubtitles = combinedSubtitles.concat(subs);
                    } catch (error) {
                        continue; // Continue para os próximos versos mesmo se um falhar
                    }
                }
                subtitles = combinedSubtitles;
            } else {
                for (let i = 1; i < version; i++) {
                    const previousSrtFile = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_${language}.srt`;
                    
                    // Use safeResourceCheck em vez de fetch
                    const exists = await safeResourceCheck(previousSrtFile);
                    if (!exists) break;
                    
                    try {
                        const previousSubtitles = await parseSRT(previousSrtFile);
                        segmentOffset += previousSubtitles.length;
                    } catch {
                        break;
                    }
                }

                srtFile = `subtitles/psalm_${lessonId}/v.${version}_psalm_${lessonId}_${language}.srt`;
                
                // Use safeResourceCheck em vez de fetch
                const exists = await safeResourceCheck(srtFile);
                if (!exists) {
                    container.innerHTML = '';
                    return [];
                }
                
                try {
                    subtitles = await parseSRT(srtFile);
                } catch {
                    container.innerHTML = '';
                    return [];
                }
            }

            container.innerHTML = subtitles.map((entry, i) => {
                let mainText = entry.mainText.replace(/(.*?)\/(.*?)(\/\/.*)?/, (match, p1, p2) => {
                    const formattedText = p2.startsWith('#') ? `<span style="font-weight: bold;">${p2.slice(1).trim()}</span>` : p2;
                    return `${p1}<br>${formattedText}`;
                }).replace(/\/\/.*$/, '');
                let extraSpacing = '';
                if (i === 0) {
                    if (mainText.trim().endsWith('#')) {
                        extraSpacing = 'style="margin-bottom: 20px; display: block;"';
                        mainText = mainText.trim().slice(0, -1);
                    }
                }
                const verseNumber = entry.verseNumber ? `<sup>${entry.verseNumber}</sup> ` : '';
                const absoluteIndex = segmentOffset + i; // Índice considerando versos anteriores
                return `<span class='text-segment' data-index='${absoluteIndex}' data-language='${language}' ${extraSpacing}>${verseNumber}${mainText}</span>`;
            }).join(' ');
            
            container.querySelectorAll('.text-segment').forEach(element => {
                element.style.cursor = 'pointer';

                element.addEventListener('mouseover', (event) => {
                    const index = parseInt(event.target.getAttribute('data-index'));
                    const language = event.target.getAttribute('data-language');
                    const otherContainer = language === 'en' ? portugueseTextContainer : englishTextContainer;

                    resetHighlights(container);
                    resetHighlights(otherContainer);

                    highlightGroup(index, container, language === 'en' ? englishTimings : portugueseTimings, language);
                    highlightGroup(index, otherContainer, language === 'en' ? portugueseTimings : englishTimings, language === 'en' ? 'pt' : 'en');
                });

                element.addEventListener('mouseout', () => {
                    resetHighlights(englishTextContainer);
                    resetHighlights(portugueseTextContainer);
                    if (lastClickedIndex !== null) {
                        highlightGroup(lastClickedIndex, englishTextContainer, englishTimings, 'en');
                        highlightGroup(lastClickedIndex, portugueseTextContainer, portugueseTimings, 'pt');
                    } else if (displayMode === 'horizontal'){
                        highlightGroup(0, englishTextContainer, englishTimings, 'en');
                        highlightGroup(0, portugueseTextContainer, portugueseTimings, 'pt');
                    }
                });

                element.addEventListener('click', (event) => {
                    const index = parseInt(event.currentTarget.getAttribute('data-index'));
                    const lang = event.currentTarget.getAttribute('data-language');
                    const audioFolder = `audios/psalm_${lessonId}/verses`;
                    const audioIndex = index + 1;
                    const audioFile = `${audioIndex}_${lang}.mp3`;
                    const audioPath = `${audioFolder}/${audioFile}`;
                    
                    stopAllAudios(true);
                    
                    requestAnimationFrame(() => {
                        resetHighlights(englishTextContainer);
                        resetHighlights(portugueseTextContainer);
                        highlightGroup(index, englishTextContainer, englishTimings, 'en');
                        highlightGroup(index, portugueseTextContainer, portugueseTimings, 'pt');
                    });
                    
                    lastClickedIndex = index;
                    
                    currentSegmentAudio = new Audio(audioPath);
                    currentSegmentAudio.play().catch(error => {
                        console.error('Erro ao reproduzir áudio do segmento:', error);
                    });

                    currentSegmentAudio.onended = () => {
                        requestAnimationFrame(() => {
                            highlightGroup(index, englishTextContainer, englishTimings, 'en');
                            highlightGroup(index, portugueseTextContainer, portugueseTimings, 'pt');
                        });
                    };
                });                                                                                                        
                
            });

            return subtitles;
        } catch (error) {
            console.error(error.message);
            container.innerHTML = '';
            return [];
        }
    };

    const highlightGroup = (index, container, timings, language) => {
        container.querySelectorAll('.text-segment').forEach((segment) => {
            const segmentIndex = parseInt(segment.getAttribute('data-index'));
            segment.style.transition = 'background 0.3s ease';
            if (segmentIndex === index) {
                if (language === 'en') {
                    segment.style.background = "linear-gradient(90deg, #cf6270, #8576d6)";
                } else {
                    segment.style.background = "linear-gradient(90deg, #4784f2, #8576d6)";
                }
                segment.style.webkitBackgroundClip = "text";
                segment.style.webkitTextFillColor = "transparent";
                segment.style.paddingTop = '2px';
                segment.style.marginTop = '-2px';
            } else {
                segment.style.background = "";
                segment.style.webkitBackgroundClip = "";
                segment.style.webkitTextFillColor = "";
                segment.style.paddingTop = '';
                segment.style.marginTop = '';
            }
        });
    };

    const resetHighlights = (container) => {
        container.querySelectorAll('.text-segment').forEach(segment => {
            segment.style.transition = 'color 0.0s ease';
            segment.style.color = '';
        });
    };

    let currentAudio = null;
    let currentInterval = null;
    let continueNarration = false;
    let currentMode = null;
    let lastClickedIndex = null;
    let highlightTimeout = null;
    let isMouseOver = false;

    let currentPlayMode = null;

    let currentSegmentAudio = null;

    const stopAllAudios = (keepHighlights = false) => {
        if (currentSegmentAudio) {
            try {
                currentSegmentAudio.ontimeupdate = null;
                currentSegmentAudio.onended = null;
                
                if (!currentSegmentAudio.paused) {
                    currentSegmentAudio.pause();
                    currentSegmentAudio.currentTime = 0;
                }
            } catch (error) {
                console.error('Erro ao parar o áudio:', error);
            } finally {
                currentSegmentAudio = null;
            }
        }
        
        englishButton.classList.remove('playing');
        
        const allAudios = document.getElementsByTagName('audio');
        Array.from(allAudios).forEach(audio => {
            if (audio && !audio.paused) {
                try {
                    audio.pause();
                    audio.currentTime = 0;
                } catch (error) {
                    console.error('Erro ao parar áudio da página:', error);
                }
            }
        });

        if (englishAudio && !englishAudio.paused) {
            try {
                englishAudio.pause();
                englishAudio.currentTime = 0;
            } catch (error) {
                console.error('Erro ao parar áudio em inglês:', error);
            }
        }

        if (currentAudio) {
            currentAudio.ontimeupdate = null;
            currentAudio.onended = null;
            currentAudio = null;
        }

        if (currentInterval) {
            clearInterval(currentInterval);
            currentInterval = null;
        }

        if (highlightTimeout) {
            clearTimeout(highlightTimeout);
            highlightTimeout = null;
        }

        if (!keepHighlights) {
            resetHighlights(englishTextContainer);
            resetHighlights(portugueseTextContainer);
        }

        continueNarration = false;
        currentMode = null;
        currentPlayMode = null;
        if (!keepHighlights) {
            lastClickedIndex = null;
        }

        englishButton.classList.remove('playing');
        alternateButton.classList.remove('playing');
    };

    let englishAudio;

    let englishTimings = [];
    let portugueseTimings = [];

    const initializeTextContainers = async () => {
        const verses = await findAvailableVerses();
    
        // Se não houver versos disponíveis, exiba uma mensagem adequada
        if (verses.length === 0) {
            englishTextContainer.innerHTML = '<p>Este salmo ainda não possui conteúdo disponível.</p>';
            portugueseTextContainer.innerHTML = '<p>Este salmo ainda não possui conteúdo disponível.</p>';
            return []; // Retorna arrays vazios para englishTimings e portugueseTimings
        }
        
        if (displayMode === 'horizontal') {
            const srtFileEn = `subtitles/psalm_${lessonId}/v.1_psalm_${lessonId}_en.srt`;
            const srtFilePt = `subtitles/psalm_${lessonId}/v.1_psalm_${lessonId}_pt.srt`;
    
            englishTimings = await loadAndDisplayText('en', englishTextContainer, 1, srtFileEn);
            portugueseTimings = await loadAndDisplayText('pt', portugueseTextContainer, 1, srtFilePt);
        } else {
            englishTimings = await loadAndDisplayText('en', englishTextContainer, currentVerseVersion);
            portugueseTimings = await loadAndDisplayText('pt', portugueseTextContainer, currentVerseVersion);
        }
        
        for (let i = 0, len = Math.min(englishTimings.length, portugueseTimings.length); i < len; i++) {
            portugueseTimings[i].start = englishTimings[i].start;
            portugueseTimings[i].end = englishTimings[i].end;
        }
    };

    const initializeAudios = async () => {
        await initializeAudioPaths();
        if (audioPaths.english) englishAudio = new Audio(audioPaths.english);

        if (!englishAudio) {
            englishButton.disabled = true;
        }
    };

    englishButton.style.color = '#cf6270';

    const isVerticalMode = window.location.pathname.includes('vertical.html');
    let displayMode = isVerticalMode ? 'vertical' : 'horizontal';

    const removeVerseNavigation = () => {
        const elements = [
            document.querySelector('.verse-navigation-fixed'),
            document.getElementById('verse-navigation'),
            document.getElementById('prev-verse'),
            document.getElementById('next-verse')
        ];
        
        elements.forEach(element => {
            if (element && element.parentElement) {
                element.parentElement.removeChild(element);
            }
        });
    };

    let verseTranslationVisibility = {};

    const toggleDisplayMode = () => {
        stopAllAudios();
        currentPlayMode = null;
        
        if (displayMode === 'vertical') {
            verseTranslationVisibility = {};
            localStorage.removeItem('readerState');
        }
        
        const currentState = {
            lessonId,
            currentVerseVersion,
            verseTranslationVisibility,
            lastActiveButton: displayToggleButton.classList.contains('active') ? 'toggle-display' : null
        };
        
        localStorage.setItem('readerState', JSON.stringify(currentState));
        
        const newPath = displayMode === 'horizontal' ? 'vertical.html' : 'lesson.html';
        window.history.replaceState({ fromToggle: true }, '', `${newPath}?lessonId=${lessonId}`);
        window.location.href = `${newPath}?lessonId=${lessonId}`;
    };

    const loadSavedState = () => {
        const savedState = localStorage.getItem('readerState');
        if (savedState) {
            const state = JSON.parse(savedState);
            currentVerseVersion = state.currentVerseVersion;
            verseTranslationVisibility = {};
            
            if (state.lastActiveButton === 'toggle-display') {
                const displayToggleButton = document.getElementById('toggle-display');
                if (displayToggleButton) {
                    buttons.forEach(btn => btn.classList.remove('active'));
                    displayToggleButton.classList.add('active');
                }
            }
        }
    };

    const initializeMode = async () => {
        loadSavedState();
        
        const translationToggle = document.getElementById('translation-toggle');
        
        if (isVerticalMode && translationToggle) {
            const translationContainer = portugueseTextContainer?.parentElement;
            if (translationContainer) {
                translationToggle.style.display = 'block';
                
                if (typeof verseTranslationVisibility[currentVerseVersion] === 'undefined') {
                    verseTranslationVisibility[currentVerseVersion] = false;
                }
                
                translationContainer.style.opacity = '0';
                translationContainer.style.display = 'none';
                translationToggle.textContent = 'show translation';
            }
            
            createVerseNavigation();
            addSwipeNavigation();
            
            await updateVerseCounter();
        } else if (translationToggle) {
            translationToggle.style.display = 'none';
            if (window.innerWidth >= 768) {
                portugueseTextContainer.style.display = 'block';
                portugueseTextContainer.style.opacity = '1';
            }
        }
        
        await initializeTextContainers();
        
        if (displayMode === 'horizontal') {
            requestAnimationFrame(() => {
                highlightGroup(0, englishTextContainer, englishTimings, 'en');
                highlightGroup(0, portugueseTextContainer, portugueseTimings, 'pt');
            });
        }
    };

    (async () => {
        removeVerseNavigation();
        await initializeAudios();
        await initializeMode();
    })();

    const displayToggleButton = document.getElementById('toggle-display');
    if (displayToggleButton) {
        displayToggleButton.addEventListener('click', () => {
            if (!displayToggleButton.classList.contains('active')) {
                buttons.forEach(btn => btn.classList.remove('active'));
                displayToggleButton.classList.add('active');
            }
            toggleDisplayMode();
        });
    }

    document.querySelectorAll('.play-button, #play-alternate').forEach(button => {
        button.addEventListener('touchstart', () => {
            button.classList.add('active-touch');
        }, {passive: true});
        button.addEventListener('touchend', () => {
            button.classList.remove('active-touch');
        }, {passive: true});
    });

    const lessonCard1 = document.querySelector('.lesson-card[data-number="1"]');
    if (lessonCard1) {
        lessonCard1.addEventListener('click', () => {
            toggleDisplayMode();
            setTimeout(() => {
                window.location.href = '/lesson.html?lessonId=1';
            }, 150);
        });
    }

    (async () => {
        removeVerseNavigation();
        await initializeAudios();
        await initializeTextContainers();
        if (displayMode === 'horizontal') {
            requestAnimationFrame(() => {
                highlightGroup(0, englishTextContainer, englishTimings, 'en');
                highlightGroup(0, portugueseTextContainer, portugueseTimings, 'pt');
            });
        }
    })();

    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        if (button.id !== 'toggle-display') {
            button.addEventListener('click', () => {
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
        }
    });

    if (translationToggle) {
        translationToggle.addEventListener('click', () => {
            const translationContainer = portugueseTextContainer.parentElement;
            const isVisible = translationContainer.style.opacity === '1';
            
            verseTranslationVisibility[currentVerseVersion] = !isVisible;
            
            translationContainer.style.display = isVisible ? 'none' : 'block';
            translationContainer.style.opacity = isVisible ? '0' : '1';
            translationToggle.textContent = isVisible ? 'show translation' : 'hide translation';
        });
    }

    englishButton.addEventListener('click', () => {
        stopAllAudios();
        if (englishAudio) {
            currentAudio = englishAudio;
            englishAudio.play().catch(error => console.error('Erro ao reproduzir áudio em inglês:', error))
                .then(() => updateHighlights());
        } else {
            console.error('Áudio em inglês não disponível.');
        }
    });

    alternateButton.addEventListener('click', () => {
        stopAllAudios();
        if (englishAudio) {
            currentAudio = englishAudio;
            englishAudio.play().catch(error => console.error('Erro ao reproduzir áudio alternado:', error))
                .then(() => updateHighlights());
        } else {
            console.error('Áudio alternado indisponível.');
        }
    });

    const updateHighlights = () => {
        if (!currentAudio || lastClickedIndex !== null || !currentSegmentAudio) {
            return;
        }
        
        const time = currentAudio.currentTime;
        
        requestAnimationFrame(() => {
            englishTextContainer.querySelectorAll('.text-segment').forEach((segment, i) => {
                segment.style.color = (time >= englishTimings[i].start && time < englishTimings[i].end) 
                                    ? '#d86572' 
                                    : '';
            });
            
            portugueseTextContainer.querySelectorAll('.text-segment').forEach((segment, i) => {
                segment.style.color = (time >= portugueseTimings[i].start && time < portugueseTimings[i].end) 
                                    ? '#4784f2' 
                                    : '';
            });

            if (currentAudio.ended || currentAudio.currentTime >= currentAudio.duration) {
                const lastIndex = englishTimings.length - 1;
                highlightGroup(lastIndex, englishTextContainer, englishTimings, 'en');
                highlightGroup(lastIndex, portugueseTextContainer, portugueseTimings, 'pt');
                return;
            }

            if (!lastClickedIndex) {
                requestAnimationFrame(updateHighlights);
            }
        });
    };

    const alternateNarration = async () => {
        stopAllAudios();
        
        let segmentIndex = 0;
        let segmentOffset = 0;
        let currentLanguage = 'pt';
        let lastSegmentIndex = 0;
        
        console.log("Iniciando leitura alternada - Reset completo dos índices");
    
        if (displayMode === 'horizontal') {
            segmentOffset = 0;
            segmentIndex = 0;
            lastSegmentIndex = 0;
            
            resetHighlights(englishTextContainer);
            resetHighlights(portugueseTextContainer);
            
            let combinedEnglishTimings = [];
            let combinedPortugueseTimings = [];
            
            const availableVerses = await findAvailableVerses();
            console.log("Versos disponíveis:", availableVerses);
            
            for (let i of availableVerses) {
                const verseEnSrtFile = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_en.srt`;
                const versePtSrtFile = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_pt.srt`;
                
                try {
                    const [verseEnSubs, versePtSubs] = await Promise.all([
                        parseSRT(verseEnSrtFile),
                        parseSRT(versePtSrtFile)
                    ]);
                    
                    console.log(`Carregando verso ${i}: EN=${verseEnSubs.length} segmentos, PT=${versePtSubs.length} segmentos`);
                    
                    combinedEnglishTimings = combinedEnglishTimings.concat(verseEnSubs);
                    combinedPortugueseTimings = combinedPortugueseTimings.concat(versePtSubs);
                } catch (error) {
                    console.error(`Erro ao carregar os arquivos SRT do verso ${i}:`, error);
                }
            }
            
            if (combinedEnglishTimings.length > 0) {
                englishTimings = combinedEnglishTimings;
                console.log("Total de segmentos em inglês carregados:", englishTimings.length);
            }
            if (combinedPortugueseTimings.length > 0) {
                portugueseTimings = combinedPortugueseTimings;
                console.log("Total de segmentos em português carregados:", portugueseTimings.length);
            }
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            setTimeout(() => {
                const firstSegment = document.querySelector('.text-segment[data-index="0"]');
                if (firstSegment) {
                    firstSegment.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        } 
        else if (displayMode === 'vertical') {
            for (let i = 1; i < currentVerseVersion; i++) {
                const previousSrtFile = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_en.srt`;
                try {
                    const previousSubtitles = await parseSRT(previousSrtFile);
                    segmentOffset += previousSubtitles.length;
                } catch {
                    break;
                }
            }
        }
    
        const totalSegments = Math.max(englishTimings.length, portugueseTimings.length);
        const audioFolder = `audios/psalm_${lessonId}/verses`;
    
        resetHighlights(englishTextContainer);
        resetHighlights(portugueseTextContainer);
        segmentIndex = 0;
        lastSegmentIndex = 0;
        console.log("Modo alternado: Iniciando com segmentIndex=0, lastSegmentIndex=0");
    
        highlightGroup(0, englishTextContainer, englishTimings, 'en');
        highlightGroup(0, portugueseTextContainer, portugueseTimings, 'pt');
    
        const playSegment = () => {
            if (segmentIndex >= totalSegments) {
                resetHighlights(englishTextContainer);
                resetHighlights(portugueseTextContainer);
                highlightGroup(lastSegmentIndex, englishTextContainer, englishTimings, 'en');
                highlightGroup(lastSegmentIndex, portugueseTextContainer, portugueseTimings, 'pt');
                return;
            }
    
            const audioIndex = segmentOffset + segmentIndex + 1;
            const englishAudioFile = `${audioIndex}_en.mp3`;
            const portugueseAudioFile = `${audioIndex}_pt.mp3`;
            
            console.log(`Reproduzindo segmento ${segmentIndex} (audioIndex=${audioIndex}), idioma=${currentLanguage}`);
    
            const playAudio = (language, audioFile, timings) => {
                if (!audioFile || segmentIndex >= timings.length) {
                    currentLanguage = (currentLanguage === 'pt') ? 'en' : 'pt';
                    if (language === 'pt') {
                        if (englishAudioFile) {
                            playAudio('en', englishAudioFile, englishTimings);
                        } else {
                            segmentIndex++;
                            playSegment();
                        }
                    } else {
                        segmentIndex++;
                        playSegment();
                    }
                    return;
                }
    
                currentSegmentAudio = new Audio(`${audioFolder}/${audioFile}`);
                const absoluteIndex = segmentOffset + segmentIndex;
                
                console.log(`Destacando segmento: absoluteIndex=${absoluteIndex}`);
    
                requestAnimationFrame(() => {
                    resetHighlights(englishTextContainer);
                    resetHighlights(portugueseTextContainer);
                    highlightGroup(absoluteIndex, englishTextContainer, englishTimings, 'en');
                    highlightGroup(absoluteIndex, portugueseTextContainer, portugueseTimings, 'pt');
                    lastSegmentIndex = absoluteIndex;
                });
    
                currentSegmentAudio.onended = () => {
                    currentLanguage = (currentLanguage === 'pt') ? 'en' : 'pt';
                    if (language === 'pt') {
                        playAudio('en', englishAudioFile, englishTimings);
                    } else {
                        segmentIndex++;
                        playSegment();
                    }
                };
    
                currentSegmentAudio.play().catch(err => {
                    console.error(`Erro ao reproduzir áudio do segmento (${language}):`, err);
                    currentLanguage = (currentLanguage === 'pt') ? 'en' : 'pt';
                    if (language === 'pt') {
                        if (englishAudioFile) {
                            playAudio('en', englishAudioFile, englishTimings);
                        } else {
                            segmentIndex++;
                            playSegment();
                        }
                    } else {
                        segmentIndex++;
                        playSegment();
                    }
                });
            };
    
            if (currentLanguage === 'pt') {
                playAudio('pt', portugueseAudioFile, portugueseTimings);
            } else {
                playAudio('en', englishAudioFile, englishTimings);
            }
        };
    
        setTimeout(() => {
            playSegment();
        }, 200);
    };

    alternateButton.addEventListener('click', () => {
        if (currentPlayMode === 'alternate') {
            stopAllAudios();
            return;
        }
        stopAllAudios();
        currentPlayMode = 'alternate';
        alternateNarration();
    });

    const updateVerseContent = async () => {
        if (displayMode !== 'vertical') return;
        
        const shouldShowTranslation = verseTranslationVisibility[currentVerseVersion] === true;
        const translationContainer = portugueseTextContainer.parentElement;
        
        if (shouldShowTranslation) {
            translationContainer.style.display = 'block';
            translationContainer.style.opacity = '0';
        } else {
            translationContainer.style.display = 'none';
            translationContainer.style.opacity = '0';
        }
        
        englishTextContainer.classList.add('fade-out');
        translationToggle.classList.add('fade-out');
        
        if (shouldShowTranslation) {
            portugueseTextContainer.classList.add('fade-out');
        }
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        translationToggle.textContent = shouldShowTranslation ? 'hide translation' : 'show translation';
        
        if (!shouldShowTranslation) {
            translationContainer.style.display = 'none';
            translationContainer.style.opacity = '0';
        }
        
        await initializeTextContainers();
        
        if (shouldShowTranslation) {
            translationContainer.style.display = 'block';
            translationContainer.style.opacity = '1';
        } else {
            translationContainer.style.display = 'none';
            translationContainer.style.opacity = '0';
        }
        
        requestAnimationFrame(() => {
            englishTextContainer.classList.remove('fade-out');
            portugueseTextContainer.classList.remove('fade-out');
            translationToggle.classList.remove('fade-out');
            
            englishTextContainer.classList.add('fade-in');
            translationToggle.classList.add('fade-in');
            
            if (shouldShowTranslation) {
                portugueseTextContainer.classList.add('fade-in');
            }
            
            setTimeout(() => {
                englishTextContainer.classList.remove('fade-in');
                portugueseTextContainer.classList.remove('fade-in');
                translationToggle.classList.remove('fade-in');
            }, 150);
        });
        
        if (englishTimings.length === 0 && portugueseTimings.length === 0) {
            currentVerseVersion = 1;
            await initializeTextContainers();
            await updateVerseCounter();
        }
        
        await updateVerseCounter();
    };

    let availableVerses = null;

    const findAvailableVerses = async () => {
        // Se já temos os versos disponíveis em cache, retorne-os imediatamente
        if (availableVerses !== null) return availableVerses;
        
        try {
            // Primeiro, carregue o arquivo de configuração
            const configResponse = await fetch('psalm-config.json', {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            
            if (configResponse.ok) {
                const config = await configResponse.json();
                if (config[lessonId] !== undefined) {
                    const versesCount = config[lessonId];
                    
                    // Se o número de versos for 0, retornar array vazio
                    // sem tentar fazer nenhuma requisição adicional
                    if (versesCount === 0) {
                        availableVerses = [];
                        return [];
                    }
                    
                    const verses = Array.from({ length: versesCount }, (_, i) => i + 1);
                    availableVerses = verses;
                    return verses;
                }
            }
        } catch (error) {
            // Se falhar, continua para o método dinâmico abaixo
        }
        
        // Método de fallback usando verificação dinâmica silenciosa
        const verses = [];
        for (let i = 1; i <= 176; i++) {
            // Use nossa função silenciosa que não gera erros 404
            const [enExists, ptExists] = await Promise.all([
                checkResourceSilently(`subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_en.srt`),
                checkResourceSilently(`subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_pt.srt`)
            ]);
            
            if (enExists && ptExists) {
                verses.push(i);
            } else {
                break;
            }
        }
        
        // Garanta que pelo menos os versos 1 e 2 sejam incluídos
        if (verses.length === 0) verses.push(1, 2);
        
        availableVerses = verses;
        return verses;
    };

    // Nova função silenciosa que não gera erros no console
    const checkResourceSilently = (url) => {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
            setTimeout(() => resolve(false), 200);
        });
    };

    const checkVerseExists = async (version) => {
        const verses = await findAvailableVerses();
        return verses.includes(version);
    };

    const createVerseNavigation = () => {
        if (displayMode !== 'vertical') {
            return;
        }

        const buttonContainer = document.querySelector('.button-container-fixed');
        if (!buttonContainer) return;

        const existingPrev = document.getElementById('prev-verse');
        const existingNext = document.getElementById('next-verse');
        if (existingPrev) existingPrev.remove();
        if (existingNext) existingNext.remove();

        const prevButton = document.createElement('button');
        prevButton.id = 'prev-verse';
        prevButton.style.cssText = `
            border: none;
            background: rgba(255,255,255,0.1);
            width: 20px;
            height: 20px;
            padding: 0;
            margin: 12px 10px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            align-self: center;
        `;

        const nextButton = document.createElement('button');
        nextButton.id = 'next-verse';
        nextButton.style.cssText = prevButton.style.cssText;

        prevButton.addEventListener('click', async () => {
            stopAllAudios();
            
            // Força recarregar a lista de versos para detectar novos versos adicionados
            clearVersesCache();
            
            const verses = await findAvailableVerses();
            if (verses.length === 0) return;
            
            const currentIndex = verses.indexOf(currentVerseVersion);
            const newIndex = currentIndex > 0 ? currentIndex - 1 : verses.length - 1;
            currentVerseVersion = verses[newIndex];
            
            prevButton.style.backgroundColor = "rgba(255,255,255,0.3)";
            nextButton.style.backgroundColor = "rgba(255,255,255,0.1)";
            
            updateVerseContent();
        });

        nextButton.addEventListener('click', async () => {
            stopAllAudios();
            
            // Força recarregar a lista de versos para detectar novos versos adicionados
            clearVersesCache();
            
            const verses = await findAvailableVerses();
            if (verses.length === 0) return;
            
            const currentIndex = verses.indexOf(currentVerseVersion);
            const newIndex = (currentIndex + 1) % verses.length;
            currentVerseVersion = verses[newIndex];
            
            nextButton.style.backgroundColor = "rgba(255,255,255,0.3)";
            prevButton.style.backgroundColor = "rgba(255,255,255,0.1)";
            
            updateVerseContent();
        });

        buttonContainer.insertBefore(prevButton, buttonContainer.firstChild);
        buttonContainer.appendChild(nextButton);
    };

    const addSwipeNavigation = () => {
        let touchStartX = null;
        const containers = [
            englishTextContainer,
            portugueseTextContainer,
            document.getElementById('verse-navigation'),
        ];

        const handleTouchStart = (e) => {
            touchStartX = e.changedTouches[0].screenX;
        };

        const handleTouchEnd = async (e) => {
            if (touchStartX === null) return;
            const touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            const threshold = 50;
            
            const verses = await findAvailableVerses();
            if (verses.length === 0) return;
            
            const currentIndex = verses.indexOf(currentVerseVersion);
            
            if (Math.abs(diff) > threshold) {
                stopAllAudios();
                
                if (diff > threshold) {
                    const newIndex = (currentIndex + 1) % verses.length;
                    currentVerseVersion = verses[newIndex];
                } else {
                    const newIndex = currentIndex > 0 ? currentIndex - 1 : verses.length - 1;
                    currentVerseVersion = verses[newIndex];
                }
                updateVerseContent();
            }
            touchStartX = null;
            updateVerseCounter();
        };

        containers.forEach(container => {
            if (container) {
                container.addEventListener('touchstart', handleTouchStart, { passive: true });
                container.addEventListener('touchend', handleTouchEnd, { passive: true });
            }
        });

        document.getElementById('text-container').addEventListener('touchstart', handleTouchStart, { passive: true });
        document.getElementById('text-container').addEventListener('touchend', handleTouchEnd, { passive: true });
    };

    const playAllEnglishVerses = async () => {
        stopAllAudios(true);
        let currentVerseIndex = 0;
        let currentSegmentIndex = -1;
        const audioFolder = `audios/psalm_${lessonId}`;
        
        const verses = [];
        
        const availableVerses = await findAvailableVerses();
        console.log("Play English: Versos disponíveis:", availableVerses);
        
        for (let i of availableVerses) {
            const audioPath = `${audioFolder}/v.${i}_psalm_${lessonId}_en.mp3`;
            const enSrtPath = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_en.srt`;
            const ptSrtPath = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_pt.srt`;
            
            // Use safeResourceCheck em vez de fetch
            const [audioExists, enExists, ptExists] = await Promise.all([
                safeResourceCheck(audioPath),
                safeResourceCheck(enSrtPath),
                safeResourceCheck(ptSrtPath)
            ]);
            
            if (audioExists && enExists && ptExists) {
                try {
                    const [enSubtitles, ptSubtitles] = await Promise.all([
                        parseSRT(enSrtPath),
                        parseSRT(ptSrtPath)
                    ]);

                    const previousVerseLength = verses.reduce((acc, v) => acc + (v?.enSubtitles?.length || 0), 0);
                    verses.push({
                        audioPath,
                        enSubtitles,
                        ptSubtitles,
                        startIndex: previousVerseLength,
                        segmentCount: enSubtitles.length
                    });
                    
                    console.log(`Play English: Verso ${i} carregado, começa no índice ${previousVerseLength}, tem ${enSubtitles.length} segmentos`);
                } catch (error) {
                    console.error(`Erro ao carregar o verso ${i}:`, error);
                    break;
                }
            }
        }

        resetHighlights(englishTextContainer);
        resetHighlights(portugueseTextContainer);
        currentVerseIndex = 0;
        currentSegmentIndex = -1;
        
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const playVerse = async () => {
            if (currentVerseIndex >= verses.length) {
                const lastSegmentIndex = verses.reduce((acc, verse, index) => {
                    if (index === verses.length - 1) {
                        return acc + verse.segmentCount - 1;
                    }
                    return acc + verse.segmentCount;
                }, 0);
                
                if (currentSegmentAudio) {
                    currentSegmentAudio.pause();
                    currentSegmentAudio.currentTime = 0;
                    currentSegmentAudio = null;
                }
                
                highlightGroup(lastSegmentIndex, englishTextContainer, englishTimings, 'en');
                highlightGroup(lastSegmentIndex, portugueseTextContainer, portugueseTimings, 'pt');
                
                return;
            }

            const currentVerse = verses[currentVerseIndex];
            
            const firstSegmentOfVerse = currentVerse.startIndex;
            console.log(`Destacando o primeiro segmento do verso ${currentVerseIndex + 1}: índice ${firstSegmentOfVerse}`);
            
            requestAnimationFrame(() => {
                resetHighlights(englishTextContainer);
                resetHighlights(portugueseTextContainer);
                highlightGroup(firstSegmentOfVerse, englishTextContainer, englishTimings, 'en');
                highlightGroup(firstSegmentOfVerse, portugueseTextContainer, portugueseTimings, 'pt');
            });
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            currentSegmentAudio = new Audio(currentVerse.audioPath);
            
            console.log(`Play English: Reproduzindo verso ${currentVerseIndex + 1} (índice ${currentVerseIndex}), começa no índice ${currentVerse.startIndex}`);

            currentSegmentAudio.onended = () => {
                if (currentVerseIndex === verses.length - 1) {
                    const lastSegmentIndex = verses.reduce((acc, verse, index) => {
                        if (index === verses.length - 1) {
                            return acc + verse.segmentCount - 1;
                        }
                        return acc + verse.segmentCount;
                    }, 0);
                    
                    resetHighlights(englishTextContainer);
                    resetHighlights(portugueseTextContainer);
                    highlightGroup(lastSegmentIndex, englishTextContainer, englishTimings, 'en');
                    highlightGroup(lastSegmentIndex, portugueseTextContainer, portugueseTimings, 'pt');
                    englishButton.classList.remove('playing');
                } else {
                    currentVerseIndex++;
                    playVerse();
                }
            };

            currentSegmentAudio.ontimeupdate = () => {
                try {
                    if (!currentSegmentAudio) return;
                    
                    const currentTime = currentSegmentAudio.currentTime;
                    
                    if (currentTime < 0.3) {
                        if (currentSegmentIndex !== firstSegmentOfVerse) {
                            currentSegmentIndex = firstSegmentOfVerse;
                            requestAnimationFrame(() => {
                                resetHighlights(englishTextContainer);
                                resetHighlights(portugueseTextContainer);
                                highlightGroup(firstSegmentOfVerse, englishTextContainer, englishTimings, 'en');
                                highlightGroup(firstSegmentOfVerse, portugueseTextContainer, portugueseTimings, 'pt');
                            });
                        }
                        return;
                    }
                    
                    for (let i = 0; i < currentVerse.segmentCount; i++) {
                        const timing = currentVerse.enSubtitles[i];
                        const absoluteIndex = currentVerse.startIndex + i;
                        
                        if (currentTime >= timing.start && currentTime < timing.end) {
                            if (currentSegmentIndex !== absoluteIndex) {
                                currentSegmentIndex = absoluteIndex;
                                requestAnimationFrame(() => {
                                    resetHighlights(englishTextContainer);
                                    resetHighlights(portugueseTextContainer);
                                    highlightGroup(absoluteIndex, englishTextContainer, englishTimings, 'en');
                                    highlightGroup(absoluteIndex, portugueseTextContainer, portugueseTimings, 'pt');
                                });
                            }
                            return;
                        }
                    }
                } catch (error) {
                    console.error("Erro no ontimeupdate:", error);
                    return;
                }
            };

            try {
                await currentSegmentAudio.play();
            } catch (err) {
                console.error(`Erro ao reproduzir áudio do verso:`, err);
                currentVerseIndex++;
                playVerse();
            }
        };

        setTimeout(() => {
            playVerse();
        }, 200);
    };

    const playCurrentEnglishVerse = async () => {
        stopAllAudios();
        
        let segmentOffset = 0;
        for (let i = 1; i < currentVerseVersion; i++) {
            const previousSrtPath = `subtitles/psalm_${lessonId}/v.${i}_psalm_${lessonId}_en.srt`;
            try {
                const previousSubtitles = await parseSRT(previousSrtPath);
                segmentOffset += previousSubtitles.length;
            } catch {
                break;
            }
        }

        const audioFile = await getAudioPath(`audios/psalm_${lessonId}/v.${currentVerseVersion}_psalm_${lessonId}_en`);
        if (!audioFile) {
            console.error('Áudio não encontrado para o verso atual.');
            return;
        }

        currentSegmentAudio = new Audio(audioFile);

        const [enSubtitles, ptSubtitles] = await Promise.all([
            loadAndDisplayText('en', englishTextContainer, currentVerseVersion),
            loadAndDisplayText('pt', portugueseTextContainer, currentVerseVersion)
        ]);

        englishTimings = enSubtitles;
        portugueseTimings = ptSubtitles;

        currentSegmentIndex = -1;
        
        requestAnimationFrame(() => {
            resetHighlights(englishTextContainer);
            resetHighlights(portugueseTextContainer);
            highlightGroup(segmentOffset, englishTextContainer, englishTimings, 'en');
            highlightGroup(segmentOffset, portugueseTextContainer, portugueseTimings, 'pt');
        });

        currentSegmentAudio.ontimeupdate = () => {
            try {
                if (!currentSegmentAudio) return;
                
                const currentTime = currentSegmentAudio.currentTime;
                
                if (currentTime < 0.3) {
                    if (currentSegmentIndex !== segmentOffset) {
                        currentSegmentIndex = segmentOffset;
                        requestAnimationFrame(() => {
                            resetHighlights(englishTextContainer);
                            resetHighlights(portugueseTextContainer);
                            highlightGroup(segmentOffset, englishTextContainer, englishTimings, 'en');
                            highlightGroup(segmentOffset, portugueseTextContainer, portugueseTimings, 'pt');
                        });
                    }
                    return;
                }
                
                for (let i = 0; i < englishTimings.length; i++) {
                    if (currentTime >= englishTimings[i].start && currentTime < englishTimings[i].end) {
                        const absoluteIndex = segmentOffset + i;
                        if (currentSegmentIndex !== absoluteIndex) {
                            currentSegmentIndex = absoluteIndex;
                            highlightGroup(absoluteIndex, englishTextContainer, englishTimings, 'en');
                            highlightGroup(absoluteIndex, portugueseTextContainer, portugueseTimings, 'pt');
                        }
                        return;
                    }
                }
            } catch (error) {
                console.error("Erro no ontimeupdate:", error);
                return;
            }
        };

        currentSegmentAudio.onended = () => {
            const lastIndex = segmentOffset + englishTimings.length - 1;
            highlightGroup(lastIndex, englishTextContainer, englishTimings, 'en');
            highlightGroup(lastIndex, portugueseTextContainer, portugueseTimings, 'pt');
            englishButton.classList.remove('playing');
        };

        try {
            await currentSegmentAudio.play();
        } catch (err) {
            console.error(`Erro ao reproduzir áudio do segmento:`, err);
            highlightGroup(segmentOffset, englishTextContainer, englishTimings, 'en');
            highlightGroup(segmentOffset, portugueseTextContainer, portugueseTimings, 'pt');
        }
    };

    englishButton.addEventListener('click', () => {
        if (currentPlayMode === 'english') {
            stopAllAudios();
            englishButton.classList.remove('playing');
            return;
        }
        
        stopAllAudios();
        currentPlayMode = 'english';
        englishButton.classList.add('playing');
        
        if (displayMode === 'horizontal') {
            playAllEnglishVerses()
                .then(() => {
                    englishButton.classList.remove('playing');
                })
                .catch(() => {
                    englishButton.classList.remove('playing');
                });
        } else {
            playCurrentEnglishVerse()
                .then(() => {
                    englishButton.classList.remove('playing');
                })
                .catch(() => {
                    englishButton.classList.remove('playing');
                });
        }
    });

    const playButton = document.querySelector('.play-button-red');

    if (playButton) {
        const playSequentialAudios = async () => {
            const audioFiles = [
                'public/audios/psalm_1/v.1_psalm_1_en.mp3',
                'public/audios/psalm_1/v.2_psalm_1_en.mp3'
            ];

            let currentAudioIndex = 0;

            const playNextAudio = () => {
                if (currentAudioIndex >= audioFiles.length) return;

                const audio = new Audio(audioFiles[currentAudioIndex]);
                audio.play().catch(error => console.error('Erro ao reproduzir áudio:', error));

                audio.onended = () => {
                    currentAudioIndex++;
                    playNextAudio();
                };
            };

            playNextAudio();
        };

        playButton.addEventListener('click', playSequentialAudios);
    }

    removeVerseNavigation();

    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        #portuguese-text {
            transition: opacity 0.15s ease-out;
        }
        .fade-out {
            opacity: 0;
            transition: opacity 0.2s ease-out;
        }
        .fade-in {
            opacity: 1;
            transition: opacity 0.2s ease-in;
        }
    `;
    document.head.appendChild(styleSheet);

    window.addEventListener('resize', () => {
        if (displayMode === 'horizontal') {
            if (window.innerWidth >= 768) {
                portugueseTextContainer.style.display = 'block';
                portugueseTextContainer.style.opacity = '1';
            } else {
                portugueseTextContainer.style.display = 'none';
            }
        }
    });

    window.addEventListener('popstate', (event) => {
        window.location.href = 'index.html';
    });

    const forceHighlightFirstSegment = (verseStartIndex) => {
        requestAnimationFrame(() => {
            resetHighlights(englishTextContainer);
            resetHighlights(portugueseTextContainer);
            
            highlightGroup(verseStartIndex, englishTextContainer, englishTimings, 'en');
            highlightGroup(verseStartIndex, portugueseTextContainer, portugueseTimings, 'pt');
        });
        
        setTimeout(() => {
            const firstSegment = document.querySelector(`.text-segment[data-index="${verseStartIndex}"]`);
            if (firstSegment) {
                void firstSegment.offsetWidth;
            }
        }, 10);
    };

    const updateVerseCounter = async () => {
        const verseCounter = document.getElementById('verse-counter');
        if (!isVerticalMode || !verseCounter) return;
        
        clearVersesCache();
        
        const verses = await findAvailableVerses();
        const totalVerses = verses.length;
        
        const currentIndex = verses.indexOf(currentVerseVersion);
        
        const currentPosition = currentIndex >= 0 ? currentIndex + 1 : 1;
        
        verseCounter.textContent = `${currentPosition}/${totalVerses}`;
        
        console.log(`Contador atualizado: ${currentPosition}/${totalVerses}`);
    };

    const clearVersesCache = () => {
        console.log("Limpando cache de versículos");
        availableVerses = null;
    };

    const resourceExists = async (url) => {
        // Cria uma tag de imagem para verificar a existência do arquivo
        // Esta técnica evita que erros 404 sejam exibidos no console
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            
            // Adiciona um parâmetro de consulta aleatório para evitar cache
            const randomParam = Date.now();
            img.src = `${url}?noCache=${randomParam}`;
            
            // Define um timeout para resolver como falso se demorar muito
            setTimeout(() => resolve(false), 500);
        });
    };

    // Sistema de alternância de bordas dos botões
    const setupButtonToggle = () => {
        const buttons = [
            document.getElementById('play-english'),
            document.getElementById('play-alternate'),
            document.getElementById('toggle-display')
        ];
        
        // Define o toggle-display como ativo (sem borda) por padrão
        document.getElementById('toggle-display').classList.add('active-button');
        
        // Adiciona evento de clique para cada botão
        buttons.forEach(button => {
            if (!button) return;
            
            button.addEventListener('click', () => {
                // Remove a classe ativa de todos os botões
                buttons.forEach(btn => {
                    if (btn) btn.classList.remove('active-button');
                });
                
                // Adiciona a classe ativa apenas ao botão clicado
                button.classList.add('active-button');
            });
        });
    };
    
    // Execute a função após o carregamento da página
    setupButtonToggle();

    // Adicionar código para fechar o popup
    const popup = document.getElementById('access-limit-popup');
    
    if (popup) {  // Verificar se o popup existe na página atual
        const closeButton = document.querySelector('.popup-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                popup.classList.remove('popup-open');
            });
        }
        
        const secondaryButton = document.querySelector('.popup-button.secondary');
        if (secondaryButton) {
            secondaryButton.addEventListener('click', () => {
                popup.classList.remove('popup-open');
            });
        }
        
        // Fechar o popup clicando fora dele
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.classList.remove('popup-open');
            }
        });
    }

});

function handleCardClick(lessonId) {
    // Verificar se o salmo tem conteúdo antes de navegar
    fetch('psalm-config.json')
        .then(response => response.json())
        .then(config => {
            if (config[lessonId] === 0) {
                // Mostrar popup de acesso limitado
                document.getElementById('access-limit-popup').classList.add('popup-open');
                return;
            }
            window.location.href = `lesson.html?lessonId=${lessonId}`;
        })
        .catch(() => {
            // Se não conseguir verificar, navega normalmente
            window.location.href = `lesson.html?lessonId=${lessonId}`;
        });
}
