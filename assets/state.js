/* ================================================================
   STATE — глобальное состояние и localStorage
   ================================================================ */
const state = {
  project: null,
  providers: [], // Теперь массив: {id, type, name, model, endpoint, active}
  activeProvider: null, // Оставлен для совместимости при миграции
  activeModel: null,
  messages: [],
  wizStep: 0,
  wizData: {},
  agentMode: false,
  handoffText: ''
};

function loadLocalState() {
  try {
    const s = JSON.parse(localStorage.getItem('gas_state') || '{}');
    state.activeProvider = s.activeProvider || null;
    state.activeModel = s.activeModel || null;
    state.providers = s.providers || [];
    
    // Миграция со старого формата (объект -> массив)
    if (state.providers && typeof state.providers === 'object' && !Array.isArray(state.providers)) {
      const oldProviders = state.providers;
      state.providers = [];
      Object.keys(oldProviders).forEach(function(type) {
        const conf = oldProviders[type];
        if (conf && conf.model) {
          const id = type + '-' + Date.now() + Math.random().toString(36).substr(2, 5);
          state.providers.push({
            id: id,
            type: type,
            name: (typeof PROVIDER_DEFAULTS !== 'undefined' && PROVIDER_DEFAULTS[type]) ? PROVIDER_DEFAULTS[type].name : type,
            model: conf.model,
            endpoint: conf.endpoint || '',
            active: (type === state.activeProvider)
          });
          // Миграция ключа в Keystore
          if (typeof isAndroid !== 'undefined' && isAndroid && typeof Bridge !== 'undefined' && Bridge.getApiKey) {
            try {
              const oldKey = Bridge.getApiKey(type);
              if (oldKey) Bridge.saveApiKey(id, oldKey);
            } catch (e) {}
          }
        }
      });
      state.activeProvider = null;
      saveLocalState();
    } else if (!Array.isArray(state.providers)) {
      state.providers = [];
    }
  } catch (e) {
    state.providers = [];
  }
}

function saveLocalState() {
  localStorage.setItem('gas_state', JSON.stringify({
    activeProvider: state.activeProvider,
    activeModel: state.activeModel,
    providers: state.providers,
  }));
}

function getRecentProjectsFallback() {
  try { return JSON.parse(localStorage.getItem('gas_recent') || '[]'); }
  catch (e) { return []; }
}