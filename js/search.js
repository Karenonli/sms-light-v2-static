// search.js — Hero live search with dropdown
(function() {
  var searchInput = document.getElementById('serviceSearch');
  var dropdown = document.getElementById('heroSearchDropdown');
  if (!searchInput || !dropdown) return;

  var hideTimer = null;

  // Render matching services as user types
  searchInput.addEventListener('input', function() {
    var val = this.value.trim();
    renderDropdown(val);
    if (val) {
      dropdown.classList.add('open');
    } else {
      dropdown.classList.remove('open');
    }
  });

  // Focus — show all if empty or matching
  searchInput.addEventListener('focus', function() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    var val = this.value.trim();
    renderDropdown(val);
    dropdown.classList.add('open');
  });

  // Blur — hide after short delay (so clicks on dropdown register)
  searchInput.addEventListener('blur', function() {
    hideTimer = setTimeout(function() {
      dropdown.classList.remove('open');
    }, 200);
  });

  // Enter — go to order section with selected query
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var val = this.value.trim();
      if (!val) return;
      dropdown.classList.remove('open');
      document.getElementById('services').scrollIntoView({ behavior: 'smooth' });
      if (typeof Order !== 'undefined') {
        Order.setMode('virtual');
        var svcInput = document.getElementById('svcSearchInput');
        if (svcInput) {
          svcInput.value = val;
          svcInput.focus();
          var evt = document.createEvent('Event');
          evt.initEvent('input', true, false);
          svcInput.dispatchEvent(evt);
        }
      }
    }
  });

  function renderDropdown(query) {
    if (typeof Data === 'undefined') return;
    query = (query || '').toLowerCase().trim();
    var services = Data.getServices();
    if (!services || services.length === 0) return;

    var html = '';
    var count = 0;

    for (var i = 0; i < services.length; i++) {
      var s = services[i];
      var match = !query || s.name.toLowerCase().indexOf(query) !== -1 || s.id.indexOf(query) !== -1;
      if (!match) continue;
      count++;
      // removed 12-item limit

      html += '<div onmousedown="pickHeroService(\'' + s.id + '\')">' +
        '<span class="dd-item__logo">' + getHeroLogo(s.id) + '</span>' +
        '<span class="dd-item__name">' + esc(s.name) + '</span>' +
        '<span class="dd-item__cat">' + s.cat + '</span>' +
        '<span class="dd-item__price">' + fmtHeroPrice(s.price) + '</span>' +
      '</div>';
    }

    if (!html) {
      html = '<div class="dd-empty">Ничего не найдено</div>';
    }

    dropdown.innerHTML = html;
  }

  // We need global functions so onmousedown works (since search.js is in its own scope)
  window.pickHeroService = function(id) {
    dropdown.classList.remove('open');
    if (typeof Data === 'undefined' || typeof Order === 'undefined') return;
    var svc = Data.getService(id);
    if (!svc) return;
    document.getElementById('services').scrollIntoView({ behavior: 'smooth' });
    Order.setMode('virtual');
    // Immediately select the service
    Order.pickService(id);
  };

  function getHeroLogo(id) {
    var map = {
      telegram:'TG', whatsapp:'WA', viber:'VB', discord:'DC', signal:'SG',
      wechat:'WC', line:'LN', skype:'SK', instagram:'IG', facebook:'FB',
      'x-twitter':'X', tiktok:'TK', snapchat:'SC', linkedin:'LI',
      pinterest:'PI', 'telegram-premium':'TP', binance:'BN', bybit:'BB',
      huobi:'HB', okx:'OK', coinbase:'CB', kraken:'KR', gateio:'GT',
      kucoin:'KC', mexc:'MX', '888poker':'88', ggpoker:'GG',
      'global-poker':'GP', pokerstars:'PS', partypoker:'PP', bet365:'B3',
      '1xbet':'1X', 'william-hill':'WH', draftkings:'DK', fanduel:'FD',
      sberbank:'SB', tinkoff:'TB', raiffeisen:'RF', paypal:'PP',
      wise:'WS', revolut:'RV', webmoney:'WM', qiwi:'QI', yoomoney:'YM',
      netflix:'NF', spotify:'SP', twitch:'TW', steam:'ST', 'epic-games':'EG',
      xbox:'XB', playstation:'PS', 'riot-games':'RG', ubisoft:'UBI',
      minecraft:'MC', pubg:'PG', 'free-fire':'FF', booking:'BK',
      uber:'UB', bolt:'BL', airbnb:'AB', avito:'AV', olx:'OL',
      craigslist:'CG', google:'GO', microsoft:'MS', apple:'AP',
      '22bet':'2B', '2dehands':'2H', aol:'AO', adidas:'AD', adobe:'AE',
      aliexpress:'AX', alibaba:'AL', audi:'AU', 'battle-net':'BA',
      bing:'BI', bumble:'BU', chatgpt:'CH', citymobil:'CM', dhl:'DH',
      derik:'DR', doordash:'DD', ebay:'EB', fiverr:'FV', foodpanda:'FP',
      gett:'GE', glovo:'GL', happn:'HP', hinge:'HI', icq:'IC',
      indeed:'IN', kakaotalk:'KT', 'kontakt-bar':'KB', linode:'LD',
      mamba:'MB', nike:'NK', okcupid:'OC', openai:'OA',
      perekrestok:'PK', 'plenty-of-fish':'PF', protonmail:'PM',
      pyaterochka:'PY', qq:'QQ', rambler:'RB', skout:'SO',
      tinder:'TD', twilio:'TL', vk:'VK', wargaming:'WG',
      wolt:'WL', yahoo:'YH', youtube:'YT', zara:'ZA',
      // New services
      blizzard:'BZ', amazon:'AM', etsy:'ET', shopee:'SH', lazada:'LZ',
      mercadolibre:'ML', rakuten:'RK', walmart:'WM', target:'TA',
      bestbuy:'BB', poshmark:'PM', offerup:'OF', yandex:'YN',
      zoho:'ZH', notion:'NT', slack:'SL', zoom:'ZO', dropbox:'DB',
      trello:'TR', shopify:'SY', wordpress:'WP', cloudflare:'CF',
      github:'GH', gitlab:'GL', digitalocean:'DO', vultr:'VR',
      heroku:'HK', namecheap:'NC', godaddy:'GD', duckduckgo:'DG',
      medium:'MD', stripe:'ST', payoneer:'PN', skrill:'SK',
      neteller:'NL', perfectmoney:'PM', advcash:'AC', westernunion:'WU',
      moneygram:'MG', remitly:'RM', nintendo:'NI', roblox:'RB',
      genshin:'GI', hoyolab:'HL', ea:'EA', origin:'OR', rockstar:'RS',
      activision:'AC', wildrift:'WR', mobilelegends:'ML', supercell:'SC',
      hoyoverse:'HV', hulu:'HU', disneyplus:'DP', hbomax:'HB',
      paramount:'PM', appletv:'AT', tidal:'TI', deezer:'DZ', soundcloud:'SC',
      badoo:'BD', tagged:'TG', meetme:'MM', twoo:'TW', tantan:'TN',
      odnoklassniki:'OK', mailru:'MR', weibo:'WB', rumble:'RU',
      foursquare:'FS', cryptocom:'CC', bitfinex:'BF', poloniex:'PL',
      bittrex:'BT', gemini:'GM', etoro:'ET', cexio:'CX', coinex:'CN',
      blockchain:'BC', zengo:'ZG', whitebit:'WB', unibet:'UN',
      leovegas:'LV', casumo:'CS', paddypower:'PP',
      threema:'TM', wire:'WR', element:'EL', session:'SS'
    };
    var short = map[id] || '?';
    if (short === '?' && id) short = id.slice(0, 2).toUpperCase();
    return '<span class="logo-badge">' + short + '</span>';
  }

  // Цена в выбранной валюте (window._currency ставит currency-switcher в index.html).
  // Курс USD совпадает с index.html (RATE 0.011).
  function fmtHeroPrice(price) {
    return window._currency === 'USD'
      ? '$' + (price * 0.011).toFixed(2)
      : price + ' ₽';
  }

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // При смене валюты перерисовать открытый список, иначе цены останутся в старой валюте
  var currencySelect = document.getElementById('currencySelect');
  if (currencySelect) {
    currencySelect.addEventListener('change', function() {
      if (dropdown.classList.contains('open')) {
        renderDropdown(searchInput.value.trim());
      }
    });
  }
})();
