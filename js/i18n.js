/* ==========================================================================
   I18N — UI strings for English, Arabic, French and Spanish
   ========================================================================== */
window.I18N = (function () {
  'use strict';

  const LANGS = [
    { code: 'en', label: 'English', dir: 'ltr' },
    { code: 'ar', label: 'العربية', dir: 'rtl' },
    { code: 'fr', label: 'Français', dir: 'ltr' },
    { code: 'es', label: 'Español', dir: 'ltr' },
  ];

  const dict = {
    en: {
      earth: 'Earth', map: 'Map', satellite: 'Satellite', dark: 'Dark', language: 'Language',
      overlay: 'Overlay', oneAtATime: 'one at a time',
      optNone: 'None', optNoneSub: 'Names only',
      optFlag: 'Flag', optFlagSub: 'Flag-filled countries',
      optCalling: 'Calling code', optCallingSub: '+34, +32, +1 …',
      optFact: 'Learn a fact', optFactSub: 'Hover a country',
      optPop: 'Population', optPopSub: '1990 → 2026 timeline',
      optCur: 'Currency', optCurSub: '€ Euro, $ US Dollar …',
      year: 'Year', worldPop: 'World population',
      popProjected: '{year} is projected from recent growth.', popSource: 'Source: World Bank.',
      est: 'est.', estimate: 'estimate',
      countries: 'Countries', searchPlaceholder: 'Search countries…', noMatch: 'No country matches that search.', clearSearch: 'Clear search',
      callingLabel: 'international calling code', peopleIn: '{n} people in {year}',
      noFact: 'No fact recorded for this territory yet.', currencyLabel: 'currency', noCurrency: 'No official currency',
      factHint: 'Hover or click a country to learn a fact',
      loadingFlags: 'Loading flags… {pct}%', flagsFailed: '{n} flags could not be loaded',
      fontsFailed: 'Label fonts could not be loaded — check your connection.',
      preparing: 'Preparing the globe…',
      collapseOverlay: 'Collapse overlay panel', expandOverlay: 'Expand overlay panel',
      collapseList: 'Collapse country list', expandList: 'Expand country list',
      darkMode: 'Dark mode',
      createdBy: 'created by', visitors: 'live visitors',
      chatTitle: 'Live chat', chatRoomOf: '{country} room', chatOnline: '{n} active in this room',
      chatSelectCountry: 'Select a country to join its chat room. Everyone can read; sign in to write.',
      chatNotConfigured: 'Chat is not configured yet (see README: Supabase setup).',
      chatSignIn: 'Sign in with Google to chat', chatSignOut: 'Sign out', chatSignInFirst: 'Sign in to do that.',
      chatPlaceholder: 'Message the {country} room…', chatPlaceholderNoRoom: 'Select a country first…', chatSend: 'Send',
      chatNoMessages: 'No messages yet — say hello!', chatConnecting: 'Connecting…',
      chatEmpty: 'Type a message first.', chatTooLong: 'Message too long (500 characters max).',
      chatRateLimited: 'Slow down — one message per second.', chatError: 'Something went wrong. Please try again.',
      chatBanned: 'Your account is restricted until {date}.',
      chatReport: 'Report', chatReported: 'Reported', chatReportConfirm: 'Report this message as abusive or spam?',
      chatReportThanks: 'Thanks — the report was recorded.', chatReportSelf: 'You cannot report your own message.',
      chatMinimise: 'Minimise chat', chatExpand: 'Expand chat',
      switchTitle: 'Switch chat room?', switchText: 'You are in the {from} room. Switch to the {to} room?',
      switchDisclaimer: 'Switching rooms will connect you to chat members currently viewing this country (they are not required to be residents of this country).',
      stay: 'Stay', switchRoom: 'Switch Room',
    },
    fr: {
      earth: 'Terre', map: 'Carte', satellite: 'Satellite', dark: 'Sombre', language: 'Langue',
      overlay: 'Calque', oneAtATime: 'un seul à la fois',
      optNone: 'Aucun', optNoneSub: 'Noms seulement',
      optFlag: 'Drapeau', optFlagSub: 'Pays remplis de leur drapeau',
      optCalling: 'Indicatif', optCallingSub: '+34, +32, +1 …',
      optFact: 'Une anecdote', optFactSub: 'Survolez un pays',
      optPop: 'Population', optPopSub: 'Chronologie 1990 → 2026',
      optCur: 'Monnaie', optCurSub: '€ Euro, $ Dollar …',
      year: 'Année', worldPop: 'Population mondiale',
      popProjected: '{year} est une projection de la croissance récente.', popSource: 'Source : Banque mondiale.',
      est: 'est.', estimate: 'estimation',
      countries: 'Pays', searchPlaceholder: 'Rechercher un pays…', noMatch: 'Aucun pays ne correspond à cette recherche.', clearSearch: 'Effacer la recherche',
      callingLabel: 'indicatif téléphonique international', peopleIn: '{n} habitants en {year}',
      noFact: 'Aucune anecdote enregistrée pour ce territoire.', currencyLabel: 'monnaie', noCurrency: 'Pas de monnaie officielle',
      factHint: 'Survolez ou cliquez un pays pour découvrir une anecdote',
      loadingFlags: 'Chargement des drapeaux… {pct} %', flagsFailed: '{n} drapeaux n’ont pas pu être chargés',
      fontsFailed: 'Les polices des étiquettes n’ont pas pu être chargées — vérifiez votre connexion.',
      preparing: 'Préparation du globe…',
      collapseOverlay: 'Replier le panneau des calques', expandOverlay: 'Déplier le panneau des calques',
      collapseList: 'Replier la liste des pays', expandList: 'Déplier la liste des pays',
      darkMode: 'Mode sombre',
      createdBy: 'créé par', visitors: 'visiteurs en direct',
      chatTitle: 'Chat en direct', chatRoomOf: 'Salon {country}', chatOnline: '{n} actif(s) dans ce salon',
      chatSelectCountry: 'Sélectionnez un pays pour rejoindre son salon. Tout le monde peut lire ; connectez-vous pour écrire.',
      chatNotConfigured: 'Le chat n’est pas encore configuré (voir README : configuration Supabase).',
      chatSignIn: 'Se connecter avec Google pour discuter', chatSignOut: 'Se déconnecter', chatSignInFirst: 'Connectez-vous pour faire cela.',
      chatPlaceholder: 'Écrire dans le salon {country}…', chatPlaceholderNoRoom: 'Sélectionnez d’abord un pays…', chatSend: 'Envoyer',
      chatNoMessages: 'Aucun message pour l’instant — dites bonjour !', chatConnecting: 'Connexion…',
      chatEmpty: 'Écrivez d’abord un message.', chatTooLong: 'Message trop long (500 caractères max).',
      chatRateLimited: 'Doucement — un message par seconde.', chatError: 'Une erreur est survenue. Réessayez.',
      chatBanned: 'Votre compte est restreint jusqu’au {date}.',
      chatReport: 'Signaler', chatReported: 'Signalé', chatReportConfirm: 'Signaler ce message comme abusif ou indésirable ?',
      chatReportThanks: 'Merci — le signalement a été enregistré.', chatReportSelf: 'Vous ne pouvez pas signaler votre propre message.',
      chatMinimise: 'Réduire le chat', chatExpand: 'Agrandir le chat',
      switchTitle: 'Changer de salon ?', switchText: 'Vous êtes dans le salon {from}. Passer au salon {to} ?',
      switchDisclaimer: 'Changer de salon vous connectera aux membres qui consultent actuellement ce pays (ils ne sont pas nécessairement résidents de ce pays).',
      stay: 'Rester', switchRoom: 'Changer de salon',
    },
    es: {
      earth: 'Tierra', map: 'Mapa', satellite: 'Satélite', dark: 'Oscuro', language: 'Idioma',
      overlay: 'Capa', oneAtATime: 'solo una a la vez',
      optNone: 'Ninguna', optNoneSub: 'Solo nombres',
      optFlag: 'Bandera', optFlagSub: 'Países rellenos con su bandera',
      optCalling: 'Prefijo', optCallingSub: '+34, +32, +1 …',
      optFact: 'Un dato', optFactSub: 'Pasa el cursor por un país',
      optPop: 'Población', optPopSub: 'Línea de tiempo 1990 → 2026',
      optCur: 'Moneda', optCurSub: '€ Euro, $ Dólar …',
      year: 'Año', worldPop: 'Población mundial',
      popProjected: '{year} es una proyección del crecimiento reciente.', popSource: 'Fuente: Banco Mundial.',
      est: 'est.', estimate: 'estimación',
      countries: 'Países', searchPlaceholder: 'Buscar países…', noMatch: 'Ningún país coincide con esa búsqueda.', clearSearch: 'Borrar búsqueda',
      callingLabel: 'prefijo telefónico internacional', peopleIn: '{n} habitantes en {year}',
      noFact: 'Aún no hay ningún dato registrado para este territorio.', currencyLabel: 'moneda', noCurrency: 'Sin moneda oficial',
      factHint: 'Pasa el cursor o haz clic en un país para aprender un dato',
      loadingFlags: 'Cargando banderas… {pct} %', flagsFailed: 'No se pudieron cargar {n} banderas',
      fontsFailed: 'No se pudieron cargar las fuentes de las etiquetas — revisa tu conexión.',
      preparing: 'Preparando el globo…',
      collapseOverlay: 'Contraer el panel de capas', expandOverlay: 'Expandir el panel de capas',
      collapseList: 'Contraer la lista de países', expandList: 'Expandir la lista de países',
      darkMode: 'Modo oscuro',
      createdBy: 'creado por', visitors: 'visitantes en vivo',
      chatTitle: 'Chat en vivo', chatRoomOf: 'Sala {country}', chatOnline: '{n} activos en esta sala',
      chatSelectCountry: 'Selecciona un país para unirte a su sala. Todos pueden leer; inicia sesión para escribir.',
      chatNotConfigured: 'El chat aún no está configurado (ver README: configuración de Supabase).',
      chatSignIn: 'Inicia sesión con Google para chatear', chatSignOut: 'Cerrar sesión', chatSignInFirst: 'Inicia sesión para hacer eso.',
      chatPlaceholder: 'Escribe en la sala {country}…', chatPlaceholderNoRoom: 'Selecciona un país primero…', chatSend: 'Enviar',
      chatNoMessages: 'Todavía no hay mensajes — ¡saluda!', chatConnecting: 'Conectando…',
      chatEmpty: 'Escribe un mensaje primero.', chatTooLong: 'Mensaje demasiado largo (máximo 500 caracteres).',
      chatRateLimited: 'Más despacio — un mensaje por segundo.', chatError: 'Algo salió mal. Inténtalo de nuevo.',
      chatBanned: 'Tu cuenta está restringida hasta el {date}.',
      chatReport: 'Reportar', chatReported: 'Reportado', chatReportConfirm: '¿Reportar este mensaje como abusivo o spam?',
      chatReportThanks: 'Gracias — el reporte quedó registrado.', chatReportSelf: 'No puedes reportar tu propio mensaje.',
      chatMinimise: 'Minimizar chat', chatExpand: 'Expandir chat',
      switchTitle: '¿Cambiar de sala?', switchText: 'Estás en la sala {from}. ¿Cambiar a la sala {to}?',
      switchDisclaimer: 'Cambiar de sala te conectará con los miembros que están viendo este país ahora mismo (no tienen por qué ser residentes de este país).',
      stay: 'Quedarme', switchRoom: 'Cambiar de sala',
    },
    ar: {
      earth: 'الأرض', map: 'الخريطة', satellite: 'القمر الصناعي', dark: 'داكن', language: 'اللغة',
      overlay: 'الطبقة', oneAtATime: 'واحدة في كل مرة',
      optNone: 'بدون', optNoneSub: 'الأسماء فقط',
      optFlag: 'العلم', optFlagSub: 'دول مملوءة بأعلامها',
      optCalling: 'رمز الاتصال', optCallingSub: '+34، +32، +1 …',
      optFact: 'تعلّم حقيقة', optFactSub: 'مرّر المؤشر فوق دولة',
      optPop: 'عدد السكان', optPopSub: 'خط زمني 1990 ← 2026',
      optCur: 'العملة', optCurSub: '€ يورو، $ دولار …',
      year: 'السنة', worldPop: 'سكان العالم',
      popProjected: 'قيم {year} تقديرية مبنية على النمو الأخير.', popSource: 'المصدر: البنك الدولي.',
      est: 'تقديري', estimate: 'تقدير',
      countries: 'الدول', searchPlaceholder: 'ابحث عن دولة…', noMatch: 'لا توجد دولة تطابق هذا البحث.', clearSearch: 'مسح البحث',
      callingLabel: 'رمز الاتصال الدولي', peopleIn: '{n} نسمة في {year}',
      noFact: 'لا توجد معلومة مسجّلة لهذه المنطقة بعد.', currencyLabel: 'العملة', noCurrency: 'لا توجد عملة رسمية',
      factHint: 'مرّر المؤشر فوق دولة أو انقر عليها لتتعلّم حقيقة',
      loadingFlags: 'جارٍ تحميل الأعلام… {pct}٪', flagsFailed: 'تعذّر تحميل {n} من الأعلام',
      fontsFailed: 'تعذّر تحميل خطوط التسميات — تحقق من الاتصال.',
      preparing: 'جارٍ تجهيز الكرة الأرضية…',
      collapseOverlay: 'طيّ لوحة الطبقات', expandOverlay: 'توسيع لوحة الطبقات',
      collapseList: 'طيّ قائمة الدول', expandList: 'توسيع قائمة الدول',
      darkMode: 'الوضع الداكن',
      createdBy: 'من إنشاء', visitors: 'زائر متصل الآن',
      chatTitle: 'دردشة مباشرة', chatRoomOf: 'غرفة {country}', chatOnline: '{n} نشط في هذه الغرفة',
      chatSelectCountry: 'اختر دولة للانضمام إلى غرفة دردشتها. يمكن للجميع القراءة؛ سجّل الدخول للكتابة.',
      chatNotConfigured: 'الدردشة غير مهيأة بعد (راجع README: إعداد Supabase).',
      chatSignIn: 'سجّل الدخول عبر Google للدردشة', chatSignOut: 'تسجيل الخروج', chatSignInFirst: 'سجّل الدخول للقيام بذلك.',
      chatPlaceholder: 'اكتب في غرفة {country}…', chatPlaceholderNoRoom: 'اختر دولة أولًا…', chatSend: 'إرسال',
      chatNoMessages: 'لا رسائل بعد — ألقِ التحية!', chatConnecting: 'جارٍ الاتصال…',
      chatEmpty: 'اكتب رسالة أولًا.', chatTooLong: 'الرسالة طويلة جدًا (500 حرف كحد أقصى).',
      chatRateLimited: 'تمهّل — رسالة واحدة في الثانية.', chatError: 'حدث خطأ ما. حاول مرة أخرى.',
      chatBanned: 'حسابك مقيّد حتى {date}.',
      chatReport: 'إبلاغ', chatReported: 'تم الإبلاغ', chatReportConfirm: 'الإبلاغ عن هذه الرسالة كمسيئة أو مزعجة؟',
      chatReportThanks: 'شكرًا — تم تسجيل البلاغ.', chatReportSelf: 'لا يمكنك الإبلاغ عن رسالتك.',
      chatMinimise: 'تصغير الدردشة', chatExpand: 'توسيع الدردشة',
      switchTitle: 'تغيير غرفة الدردشة؟', switchText: 'أنت في غرفة {from}. الانتقال إلى غرفة {to}؟',
      switchDisclaimer: 'تغيير الغرفة سيوصلك بأعضاء الدردشة الذين يشاهدون هذه الدولة حاليًا (وليس بالضرورة أن يكونوا من سكان هذه الدولة).',
      stay: 'البقاء', switchRoom: 'تغيير الغرفة',
    },
  };

  const regions = {
    fr: {
      'Africa': 'Afrique', 'Americas': 'Amériques', 'Asia': 'Asie', 'Europe': 'Europe', 'Oceania': 'Océanie', 'Antarctic': 'Antarctique',
      'Northern Africa': 'Afrique du Nord', 'Eastern Africa': 'Afrique de l’Est', 'Middle Africa': 'Afrique centrale', 'Southern Africa': 'Afrique australe', 'Western Africa': 'Afrique de l’Ouest',
      'Caribbean': 'Caraïbes', 'Central America': 'Amérique centrale', 'North America': 'Amérique du Nord', 'South America': 'Amérique du Sud',
      'Central Asia': 'Asie centrale', 'Eastern Asia': 'Asie de l’Est', 'South-Eastern Asia': 'Asie du Sud-Est', 'Southern Asia': 'Asie du Sud', 'Western Asia': 'Asie de l’Ouest',
      'Central Europe': 'Europe centrale', 'Eastern Europe': 'Europe de l’Est', 'Northern Europe': 'Europe du Nord', 'Southeast Europe': 'Europe du Sud-Est', 'Southern Europe': 'Europe du Sud', 'Western Europe': 'Europe de l’Ouest',
      'Australia and New Zealand': 'Australie et Nouvelle-Zélande', 'Melanesia': 'Mélanésie', 'Micronesia': 'Micronésie', 'Polynesia': 'Polynésie',
    },
    es: {
      'Africa': 'África', 'Americas': 'América', 'Asia': 'Asia', 'Europe': 'Europa', 'Oceania': 'Oceanía', 'Antarctic': 'Antártida',
      'Northern Africa': 'África del Norte', 'Eastern Africa': 'África Oriental', 'Middle Africa': 'África Central', 'Southern Africa': 'África Austral', 'Western Africa': 'África Occidental',
      'Caribbean': 'Caribe', 'Central America': 'América Central', 'North America': 'América del Norte', 'South America': 'América del Sur',
      'Central Asia': 'Asia Central', 'Eastern Asia': 'Asia Oriental', 'South-Eastern Asia': 'Sudeste Asiático', 'Southern Asia': 'Asia Meridional', 'Western Asia': 'Asia Occidental',
      'Central Europe': 'Europa Central', 'Eastern Europe': 'Europa Oriental', 'Northern Europe': 'Europa del Norte', 'Southeast Europe': 'Europa Sudoriental', 'Southern Europe': 'Europa Meridional', 'Western Europe': 'Europa Occidental',
      'Australia and New Zealand': 'Australia y Nueva Zelanda', 'Melanesia': 'Melanesia', 'Micronesia': 'Micronesia', 'Polynesia': 'Polinesia',
    },
    ar: {
      'Africa': 'أفريقيا', 'Americas': 'الأمريكتان', 'Asia': 'آسيا', 'Europe': 'أوروبا', 'Oceania': 'أوقيانوسيا', 'Antarctic': 'القارة القطبية الجنوبية',
      'Northern Africa': 'شمال أفريقيا', 'Eastern Africa': 'شرق أفريقيا', 'Middle Africa': 'وسط أفريقيا', 'Southern Africa': 'الجنوب الأفريقي', 'Western Africa': 'غرب أفريقيا',
      'Caribbean': 'الكاريبي', 'Central America': 'أمريكا الوسطى', 'North America': 'أمريكا الشمالية', 'South America': 'أمريكا الجنوبية',
      'Central Asia': 'آسيا الوسطى', 'Eastern Asia': 'شرق آسيا', 'South-Eastern Asia': 'جنوب شرق آسيا', 'Southern Asia': 'جنوب آسيا', 'Western Asia': 'غرب آسيا',
      'Central Europe': 'أوروبا الوسطى', 'Eastern Europe': 'أوروبا الشرقية', 'Northern Europe': 'أوروبا الشمالية', 'Southeast Europe': 'جنوب شرق أوروبا', 'Southern Europe': 'جنوب أوروبا', 'Western Europe': 'أوروبا الغربية',
      'Australia and New Zealand': 'أستراليا ونيوزيلندا', 'Melanesia': 'ميلانيزيا', 'Micronesia': 'ميكرونيزيا', 'Polynesia': 'بولينيزيا',
    },
  };

  let lang = 'en';
  const displayNames = {};

  function t(key, vars) {
    let s = (dict[lang] && dict[lang][key]) || dict.en[key] || key;
    if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function region(name) {
    return (regions[lang] && regions[lang][name]) || name;
  }
  function currencyName(code, fallback, forLang) {
    const l = forLang || lang;
    try {
      if (!displayNames[l]) displayNames[l] = new Intl.DisplayNames([l], { type: 'currency' });
      const v = displayNames[l].of(code);
      if (v && v !== code) return v.charAt(0).toUpperCase() + v.slice(1);
    } catch (e) { /* older browsers */ }
    return fallback;
  }
  function dir() { return (LANGS.find(l => l.code === lang) || LANGS[0]).dir; }
  function setLang(l) {
    lang = dict[l] ? l : 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = dir();
    apply();
  }
  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  }

  return { LANGS, t, region, currencyName, setLang, apply, dir, get lang() { return lang; } };
})();
