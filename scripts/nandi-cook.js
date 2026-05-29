/* Nandi Cook v1 — daily-use enhancements that ride on top of nandi-kitchen.js
 * Safe: only enhances existing pages, no edits required to recipe HTML files.
 *
 * Features:
 *   1. Cook Mode (Wake Lock) toggle on recipe pages
 *   2. Serving size calculator on recipe pages
 *   3. Festival-aware Recipe of the Week (homepage)
 *   4. WhatsApp share for shopping list (My Kitchen)
 *
 * No external dependencies. Plain ES5-friendly. Defer-loaded.
 */
(function(){
  'use strict';
  if (window.NandiCook) return;
  window.NandiCook = {v:'v1'};

  /* ---------- helpers ---------- */
  function $(s, c){ return (c||document).querySelector(s); }
  function $$(s, c){ return Array.from((c||document).querySelectorAll(s)); }
  function detectType(){
    var p = location.pathname;
    if(/\/recipes\/[a-z0-9\-]+\.html/.test(p)) return 'recipe';
    if(p === '/' || /\/index\.html$/.test(p)) return 'home';
    if(/\/my-kitchen\.html$/.test(p)) return 'kitchen';
    return null;
  }

  /* ============================================================
   * 1. COOK MODE — Wake Lock toggle on recipe pages
   * ============================================================ */
  var CookMode = {
    lock: null,
    supported: ('wakeLock' in navigator),
    on: false,
    request: function(){
      var self = this;
      if(!this.supported) return Promise.resolve(false);
      return navigator.wakeLock.request('screen').then(function(l){
        self.lock = l; self.on = true;
        l.addEventListener('release', function(){ self.on = false; self.update(); });
        self.update();
        return true;
      }).catch(function(){ self.on = false; self.update(); return false; });
    },
    release: function(){
      if(this.lock){ try{ this.lock.release(); }catch(e){} this.lock = null; }
      this.on = false; this.update();
    },
    btn: null,
    update: function(){
      if(!this.btn) return;
      this.btn.classList.toggle('nc-cook-on', this.on);
      this.btn.setAttribute('aria-pressed', this.on?'true':'false');
      this.btn.querySelector('.nc-cook-label').textContent = this.on ? 'Cook mode on' : 'Cook mode';
    }
  };

  function injectCookMode(){
    if(detectType() !== 'recipe') return;
    if(!CookMode.supported) return;
    var metaRow = $('.recipe-meta-row');
    if(!metaRow) return;
    if($('.nc-cook-btn')) return;

    var btn = document.createElement('button');
    btn.className = 'nc-cook-btn';
    btn.type = 'button';
    btn.setAttribute('aria-pressed','false');
    btn.setAttribute('title','Keep screen on while cooking');
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'+
      '</svg><span class="nc-cook-label">Cook mode</span>';

    btn.addEventListener('click', function(){
      if(CookMode.on) CookMode.release(); else CookMode.request();
    });

    // Re-acquire lock if visibility returns and user had it on
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible' && CookMode.on && !CookMode.lock){
        CookMode.request();
      }
    });

    CookMode.btn = btn;
    metaRow.appendChild(btn);
  }

  /* ============================================================
   * 2. SERVING SIZE CALCULATOR on recipe pages
   * Parses .recipe-ingredients-list <li>, finds quantities, scales them.
   * ============================================================ */
  // word-number support + simple unicode fractions
  var WORD_NUM = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,half:0.5,quarter:0.25};
  var UNICODE_FRAC = {'½':0.5,'⅓':1/3,'⅔':2/3,'¼':0.25,'¾':0.75,'⅕':0.2,'⅖':0.4,'⅗':0.6,'⅘':0.8,'⅙':1/6,'⅚':5/6,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875};

  function parseQty(str){
    // Returns {value:Number, raw:String, start:int, end:int} or null
    var s = str;
    // unicode fraction first (e.g. "½ cup" or "1½")
    var uniMatch = s.match(/(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/);
    if(uniMatch){
      var whole = uniMatch[1] ? parseInt(uniMatch[1],10) : 0;
      var frac = UNICODE_FRAC[uniMatch[2]];
      return {value: whole+frac, raw: uniMatch[0], start: uniMatch.index, end: uniMatch.index+uniMatch[0].length};
    }
    // ascii fraction "1 1/2" or "1/2"
    var asciiFrac = s.match(/(\d+)\s+(\d+)\/(\d+)/);
    if(asciiFrac){
      return {value: parseInt(asciiFrac[1],10)+parseInt(asciiFrac[2],10)/parseInt(asciiFrac[3],10), raw: asciiFrac[0], start: asciiFrac.index, end: asciiFrac.index+asciiFrac[0].length};
    }
    var simpleFrac = s.match(/(\d+)\/(\d+)/);
    if(simpleFrac){
      return {value: parseInt(simpleFrac[1],10)/parseInt(simpleFrac[2],10), raw: simpleFrac[0], start: simpleFrac.index, end: simpleFrac.index+simpleFrac[0].length};
    }
    // decimal "2.5" or whole "2"
    var dec = s.match(/(\d+(?:\.\d+)?)/);
    if(dec){
      return {value: parseFloat(dec[1]), raw: dec[0], start: dec.index, end: dec.index+dec[0].length};
    }
    // word numbers — only for singular ingredient counts like "Onion (1)" we already catch above
    return null;
  }

  function fmtQty(n){
    if(n === Math.floor(n)) return String(n);
    // round to nearest 0.25
    var rounded = Math.round(n*4)/4;
    var common = {0.25:'¼',0.5:'½',0.75:'¾',0.33:'⅓',0.67:'⅔'};
    var whole = Math.floor(rounded);
    var frac = rounded - whole;
    var fracStr = '';
    if(Math.abs(frac-0.25)<0.01) fracStr='¼';
    else if(Math.abs(frac-0.5)<0.01) fracStr='½';
    else if(Math.abs(frac-0.75)<0.01) fracStr='¾';
    else if(frac>0) fracStr = ' '+rounded.toFixed(2).replace(/\.?0+$/,'').replace(/^0\./,'.');
    if(whole === 0 && fracStr) return fracStr.trim();
    return whole + (fracStr?' '+fracStr.trim():'');
  }

  function detectBaseServings(){
    // Look for "X servings" in meta tag or JSON-LD
    var ld = $('script[type="application/ld+json"]');
    if(ld){
      try{
        // find first Recipe in document scripts
        var scripts = $$('script[type="application/ld+json"]');
        for(var i=0;i<scripts.length;i++){
          var data;
          try{ data = JSON.parse(scripts[i].textContent); }catch(e){ continue; }
          var arr = Array.isArray(data) ? data : [data];
          for(var j=0;j<arr.length;j++){
            if(arr[j] && arr[j]['@type']==='Recipe' && arr[j].recipeYield){
              var m = String(arr[j].recipeYield).match(/(\d+)/);
              if(m) return parseInt(m[1],10);
            }
          }
        }
      }catch(e){}
    }
    var tag = $$('.recipe-meta-tag').find(function(t){ return /serving/i.test(t.textContent); });
    if(tag){
      var m = tag.textContent.match(/(\d+)/);
      if(m) return parseInt(m[1],10);
    }
    return 4;
  }

  function injectServingCalculator(){
    if(detectType() !== 'recipe') return;
    var list = $('.recipe-ingredients-list');
    if(!list) return;
    if($('.nc-serv')) return;

    var base = detectBaseServings();
    var current = base;

    // Capture original text per <li>
    var items = $$('li', list);
    items.forEach(function(li){
      if(!li.dataset.ncOrig) li.dataset.ncOrig = li.textContent.trim();
    });

    function rescale(n){
      var ratio = n/base;
      items.forEach(function(li){
        var orig = li.dataset.ncOrig;
        var q = parseQty(orig);
        if(!q){ li.textContent = orig; return; }
        var newVal = q.value*ratio;
        var newText = orig.slice(0,q.start) + fmtQty(newVal) + orig.slice(q.end);
        li.textContent = newText;
      });
    }

    var wrap = document.createElement('div');
    wrap.className = 'nc-serv';
    wrap.innerHTML =
      '<span class="nc-serv-label">Servings</span>'+
      '<div class="nc-serv-ctrl" role="group" aria-label="Adjust servings">'+
        '<button type="button" class="nc-serv-btn" data-d="-1" aria-label="Decrease">−</button>'+
        '<span class="nc-serv-val" aria-live="polite">'+base+'</span>'+
        '<button type="button" class="nc-serv-btn" data-d="1" aria-label="Increase">+</button>'+
      '</div>'+
      '<button type="button" class="nc-serv-reset" hidden>Reset</button>';

    // Insert before ingredients h2
    var heading = list.previousElementSibling;
    while(heading && !/^H[1-6]$/.test(heading.tagName)) heading = heading.previousElementSibling;
    if(heading && heading.parentNode) heading.parentNode.insertBefore(wrap, list);
    else list.parentNode.insertBefore(wrap, list);

    var valEl = $('.nc-serv-val', wrap);
    var resetBtn = $('.nc-serv-reset', wrap);
    wrap.addEventListener('click', function(e){
      var b = e.target.closest('.nc-serv-btn');
      if(b){
        var delta = parseInt(b.dataset.d,10);
        var next = Math.max(1, Math.min(20, current+delta));
        if(next === current) return;
        current = next;
        valEl.textContent = current;
        rescale(current);
        resetBtn.hidden = (current === base);
        return;
      }
      if(e.target.closest('.nc-serv-reset')){
        current = base; valEl.textContent = base; rescale(base); resetBtn.hidden = true;
      }
    });
  }

  /* ============================================================
   * 3. FESTIVAL-AWARE RECIPE OF THE WEEK on homepage
   * Replaces the existing rotator's image/title/href if a festival window matches.
   * 5-year set-and-forget date table.
   * ============================================================ */
  // Fixed dates (gud, easy to verify). Window: 5 days before to 1 day after.
  var FESTIVALS = [
    // {date:'YYYY-MM-DD', name, slug, title, desc, img, time, product}
    // 2026
    {date:'2026-01-14', name:'Makar Sankranti', slug:'sattu-ladoo', title:'Sattu Ladoo', desc:'Til-jaggery sattu ladoo for Makar Sankranti, packed with protein and warmth.', img:'product-images/food-sattu-ladoo.webp', time:'30 min', product:'Uses Nandi Sattu'},
    {date:'2026-03-04', name:'Holi', slug:'gulab-jamun', title:'Gulab Jamun', desc:'Soft, syrup-soaked gulab jamun for Holi celebrations, made the traditional way.', img:'product-images/food-gulab-jamun.webp', time:'45 min', product:'Uses Nandi Atta'},
    {date:'2026-03-29', name:'Ram Navami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Ghee-rich sooji halwa, the classic prasad for Ram Navami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2026-04-15', name:'Chaitra Navratri', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Sattvik sooji halwa for Navratri vrat, made with ghee and pure Nandi Sooji.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2026-08-26', name:'Janmashtami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Bhog sooji halwa for Janmashtami, soft and ghee-rich.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2026-09-22', name:'Shardiya Navratri', slug:'kadhi-pakora', title:'Kadhi Pakora', desc:'Comforting Nandi Besan kadhi pakora for Navratri evenings.', img:'product-images/food-kadhi-premium.webp', time:'40 min', product:'Uses Nandi Besan'},
    {date:'2026-10-20', name:'Diwali', slug:'mathri', title:'Mathri', desc:'Crisp, flaky atta mathri for Diwali tea-time and gifting.', img:'product-images/food-mathri.webp', time:'40 min', product:'Uses Nandi Atta'},
    {date:'2026-11-15', name:'Chhath Puja', slug:'thekua', title:'Thekua', desc:'The traditional Chhath Puja prasad, crisp and lightly sweet, made with atta and gud.', img:'product-images/food-thekua.webp', time:'45 min', product:'Uses Nandi Atta'},
    // 2027
    {date:'2027-01-14', name:'Makar Sankranti', slug:'sattu-ladoo', title:'Sattu Ladoo', desc:'Til-jaggery sattu ladoo for Makar Sankranti.', img:'product-images/food-sattu-ladoo.webp', time:'30 min', product:'Uses Nandi Sattu'},
    {date:'2027-03-22', name:'Holi', slug:'gulab-jamun', title:'Gulab Jamun', desc:'Soft, syrup-soaked gulab jamun for Holi.', img:'product-images/food-gulab-jamun.webp', time:'45 min', product:'Uses Nandi Atta'},
    {date:'2027-04-15', name:'Ram Navami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Ghee-rich sooji halwa for Ram Navami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2027-04-08', name:'Chaitra Navratri', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Sattvik halwa for Navratri vrat.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2027-09-15', name:'Janmashtami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Bhog halwa for Janmashtami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2027-10-11', name:'Shardiya Navratri', slug:'kadhi-pakora', title:'Kadhi Pakora', desc:'Comforting kadhi pakora for Navratri.', img:'product-images/food-kadhi-premium.webp', time:'40 min', product:'Uses Nandi Besan'},
    {date:'2027-11-08', name:'Diwali', slug:'mathri', title:'Mathri', desc:'Crisp atta mathri for Diwali.', img:'product-images/food-mathri.webp', time:'40 min', product:'Uses Nandi Atta'},
    {date:'2027-11-04', name:'Chhath Puja', slug:'thekua', title:'Thekua', desc:'Traditional Chhath Puja prasad.', img:'product-images/food-thekua.webp', time:'45 min', product:'Uses Nandi Atta'},
    // 2028
    {date:'2028-01-14', name:'Makar Sankranti', slug:'sattu-ladoo', title:'Sattu Ladoo', desc:'Til-jaggery sattu ladoo for Makar Sankranti.', img:'product-images/food-sattu-ladoo.webp', time:'30 min', product:'Uses Nandi Sattu'},
    {date:'2028-03-11', name:'Holi', slug:'gulab-jamun', title:'Gulab Jamun', desc:'Soft, syrup-soaked gulab jamun for Holi.', img:'product-images/food-gulab-jamun.webp', time:'45 min', product:'Uses Nandi Atta'},
    {date:'2028-03-27', name:'Chaitra Navratri', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Sattvik halwa for Navratri vrat.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2028-04-04', name:'Ram Navami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Ghee-rich sooji halwa for Ram Navami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2028-09-04', name:'Janmashtami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Bhog halwa for Janmashtami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2028-09-29', name:'Shardiya Navratri', slug:'kadhi-pakora', title:'Kadhi Pakora', desc:'Comforting kadhi pakora for Navratri.', img:'product-images/food-kadhi-premium.webp', time:'40 min', product:'Uses Nandi Besan'},
    {date:'2028-10-26', name:'Diwali', slug:'mathri', title:'Mathri', desc:'Crisp atta mathri for Diwali.', img:'product-images/food-mathri.webp', time:'40 min', product:'Uses Nandi Atta'},
    {date:'2028-10-23', name:'Chhath Puja', slug:'thekua', title:'Thekua', desc:'Traditional Chhath Puja prasad.', img:'product-images/food-thekua.webp', time:'45 min', product:'Uses Nandi Atta'},
    // 2029
    {date:'2029-01-14', name:'Makar Sankranti', slug:'sattu-ladoo', title:'Sattu Ladoo', desc:'Til-jaggery sattu ladoo for Makar Sankranti.', img:'product-images/food-sattu-ladoo.webp', time:'30 min', product:'Uses Nandi Sattu'},
    {date:'2029-03-01', name:'Holi', slug:'gulab-jamun', title:'Gulab Jamun', desc:'Soft, syrup-soaked gulab jamun for Holi.', img:'product-images/food-gulab-jamun.webp', time:'45 min', product:'Uses Nandi Atta'},
    {date:'2029-04-16', name:'Chaitra Navratri', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Sattvik halwa for Navratri vrat.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2029-04-24', name:'Ram Navami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Ghee-rich sooji halwa for Ram Navami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2029-09-04', name:'Janmashtami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Bhog halwa for Janmashtami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2029-10-09', name:'Shardiya Navratri', slug:'kadhi-pakora', title:'Kadhi Pakora', desc:'Comforting kadhi pakora for Navratri.', img:'product-images/food-kadhi-premium.webp', time:'40 min', product:'Uses Nandi Besan'},
    {date:'2029-11-05', name:'Diwali', slug:'mathri', title:'Mathri', desc:'Crisp atta mathri for Diwali.', img:'product-images/food-mathri.webp', time:'40 min', product:'Uses Nandi Atta'},
    {date:'2029-11-13', name:'Chhath Puja', slug:'thekua', title:'Thekua', desc:'Traditional Chhath Puja prasad.', img:'product-images/food-thekua.webp', time:'45 min', product:'Uses Nandi Atta'},
    // 2030
    {date:'2030-01-14', name:'Makar Sankranti', slug:'sattu-ladoo', title:'Sattu Ladoo', desc:'Til-jaggery sattu ladoo for Makar Sankranti.', img:'product-images/food-sattu-ladoo.webp', time:'30 min', product:'Uses Nandi Sattu'},
    {date:'2030-03-19', name:'Holi', slug:'gulab-jamun', title:'Gulab Jamun', desc:'Soft, syrup-soaked gulab jamun for Holi.', img:'product-images/food-gulab-jamun.webp', time:'45 min', product:'Uses Nandi Atta'},
    {date:'2030-04-04', name:'Chaitra Navratri', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Sattvik halwa for Navratri vrat.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2030-04-12', name:'Ram Navami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Ghee-rich sooji halwa for Ram Navami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2030-08-23', name:'Janmashtami', slug:'sooji-halwa', title:'Sooji Halwa', desc:'Bhog halwa for Janmashtami.', img:'product-images/food-halwa-premium.webp', time:'25 min', product:'Uses Nandi Sooji'},
    {date:'2030-09-28', name:'Shardiya Navratri', slug:'kadhi-pakora', title:'Kadhi Pakora', desc:'Comforting kadhi pakora for Navratri.', img:'product-images/food-kadhi-premium.webp', time:'40 min', product:'Uses Nandi Besan'},
    {date:'2030-10-26', name:'Diwali', slug:'mathri', title:'Mathri', desc:'Crisp atta mathri for Diwali.', img:'product-images/food-mathri.webp', time:'40 min', product:'Uses Nandi Atta'},
    {date:'2030-11-01', name:'Chhath Puja', slug:'thekua', title:'Thekua', desc:'Traditional Chhath Puja prasad.', img:'product-images/food-thekua.webp', time:'45 min', product:'Uses Nandi Atta'}
  ];

  function findActiveFestival(){
    var now = new Date();
    var todayMs = now.getTime();
    // Window: 5 days before to 1 day after
    var WINDOW_BEFORE = 5*24*60*60*1000;
    var WINDOW_AFTER = 1*24*60*60*1000;
    for(var i=0;i<FESTIVALS.length;i++){
      var f = FESTIVALS[i];
      var fd = new Date(f.date+'T00:00:00').getTime();
      if(todayMs >= (fd-WINDOW_BEFORE) && todayMs <= (fd+WINDOW_AFTER)){
        return f;
      }
    }
    return null;
  }

  function injectFestivalRotator(){
    if(detectType() !== 'home') return;
    var f = findActiveFestival();
    if(!f) return;
    // Find existing Recipe of the Week section
    var sections = $$('section, div');
    var rotwSection = null;
    for(var i=0;i<sections.length;i++){
      var t = (sections[i].textContent||'').toLowerCase();
      if(t.indexOf('recipe of the week') >= 0 && sections[i].offsetHeight > 100 && sections[i].offsetHeight < 1500){
        rotwSection = sections[i]; break;
      }
    }
    if(!rotwSection) return;

    // Replace badge label
    var labels = $$('*', rotwSection).filter(function(el){ return /recipe of the week/i.test((el.textContent||'').trim()) && (el.textContent||'').trim().length < 30; });
    if(labels.length){ labels[0].textContent = f.name.toUpperCase()+' SPECIAL'; }

    // Replace "this week" eyebrow with festival eyebrow
    var thisWeek = $$('*', rotwSection).filter(function(el){ return /^this week$/i.test((el.textContent||'').trim()); });
    if(thisWeek.length){ thisWeek[0].textContent = 'THIS WEEK · '+f.name.toUpperCase(); }

    // Replace title
    var title = $('h1, h2, h3', rotwSection);
    if(title) title.textContent = f.title;

    // Replace description (the first <p> with substantial text)
    var paras = $$('p', rotwSection);
    var descP = paras.find(function(p){ return (p.textContent||'').trim().length > 30; });
    if(descP) descP.textContent = f.desc;

    // Replace image
    var img = $('img', rotwSection);
    if(img && f.img){ img.src = f.img.charAt(0)==='/'?f.img:f.img; img.alt = f.title; }

    // Replace recipe link
    var viewBtn = $$('a', rotwSection).find(function(a){ return /view recipe/i.test(a.textContent||''); });
    if(viewBtn){ viewBtn.href = 'recipes/'+f.slug+'.html'; }

    // Replace time/product chips if present
    var chips = $$('.recipe-meta-tag, [class*="chip"], [class*="badge"]', rotwSection);
    chips.forEach(function(c){
      if(/min$/i.test((c.textContent||'').trim())) c.lastChild.textContent = ' '+f.time;
      else if(/uses nandi/i.test(c.textContent||'')) c.textContent = f.product;
    });
  }

  /* ============================================================
   * 4. WHATSAPP SHARE for shopping list (My Kitchen)
   * ============================================================ */
  function buildWAText(){
    if(!window.NandiShoppingList) return '';
    var s = window.NandiShoppingList.get();
    var items = s.items || [];
    if(!items.length) return '';
    var lines = ['*My Nandi shopping list*',''];
    items.forEach(function(it){
      var checked = s.checked && s.checked[it.key];
      lines.push((checked?'✓ ':'• ')+it.text);
    });
    lines.push('');
    lines.push('Built on ecavo.in/my-kitchen.html');
    return lines.join('\n');
  }

  function injectWAShare(){
    if(detectType() !== 'kitchen') return;
    var actions = document.querySelector('.mk-shop-actions > div:last-child');
    if(!actions) return;
    if(document.getElementById('nc-wa-btn')) return;

    var btn = document.createElement('a');
    btn.id = 'nc-wa-btn';
    btn.className = 'nc-wa-btn';
    btn.href = '#';
    btn.setAttribute('role','button');
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'+
        '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.04 21.785h-.013a9.87 9.87 0 0 1-5.031-1.378l-.36-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.436-9.884 9.892-9.884 2.64.001 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.882 9.884zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.49-8.413z"/>'+
      '</svg><span>Share on WhatsApp</span>';

    btn.addEventListener('click', function(e){
      e.preventDefault();
      var txt = buildWAText();
      if(!txt){
        if(window.NandiToast) window.NandiToast.show('Add items to your list first');
        else alert('Your shopping list is empty.');
        return;
      }
      var url = 'https://wa.me/?text='+encodeURIComponent(txt);
      window.open(url, '_blank', 'noopener');
    });

    actions.insertBefore(btn, actions.firstChild);
  }

  /* ============================================================
   * STYLES
   * ============================================================ */
  function injectStyles(){
    if(document.getElementById('nc-styles')) return;
    var css =
      /* Cook mode button */
      '.nc-cook-btn{display:inline-flex;align-items:center;gap:6px;background:var(--color-surface-2,#FAF5E8);border:1px solid var(--color-border,#E5D4B0);border-radius:999px;padding:8px 14px;font-family:inherit;font-size:0.875rem;font-weight:500;color:var(--color-text,#1a1207);cursor:pointer;transition:all .2s ease;line-height:1}'+
      '.nc-cook-btn:hover{border-color:#C8A35F;background:#FFF8E8}'+
      '.nc-cook-btn.nc-cook-on{background:#1a1207;color:#C8A35F;border-color:#1a1207}'+
      '.nc-cook-btn.nc-cook-on svg{animation:nc-cook-pulse 2.4s ease-in-out infinite}'+
      '@keyframes nc-cook-pulse{0%,100%{opacity:1}50%{opacity:.5}}'+
      /* Serving calculator */
      '.nc-serv{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 var(--space-4,16px) 0;padding:10px 14px;background:var(--color-surface-2,#FAF5E8);border:1px solid var(--color-border,#E5D4B0);border-radius:12px}'+
      '.nc-serv-label{font-size:0.875rem;font-weight:600;color:var(--color-text,#1a1207)}'+
      '.nc-serv-ctrl{display:inline-flex;align-items:center;gap:0;background:#fff;border:1px solid #E5D4B0;border-radius:999px;overflow:hidden}'+
      '.nc-serv-btn{width:34px;height:34px;border:none;background:transparent;font-size:1.125rem;font-weight:700;color:#1a1207;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;transition:background .15s}'+
      '.nc-serv-btn:hover{background:#FFF8E8}'+
      '.nc-serv-val{min-width:32px;text-align:center;font-weight:700;color:#1a1207;font-size:0.9375rem;padding:0 4px}'+
      '.nc-serv-reset{background:transparent;border:none;color:#8a7355;font-size:0.8125rem;font-family:inherit;cursor:pointer;text-decoration:underline;padding:4px 8px}'+
      '.nc-serv-reset:hover{color:#1a1207}'+
      /* WhatsApp button */
      '.nc-wa-btn{display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;border:none;border-radius:999px;padding:10px 16px;font-family:inherit;font-size:0.875rem;font-weight:600;cursor:pointer;text-decoration:none;transition:all .2s ease;line-height:1}'+
      '.nc-wa-btn:hover{background:#20bd5a;transform:translateY(-1px);box-shadow:0 4px 14px rgba(37,211,102,.3);color:#fff}'+
      /* Mobile tweaks */
      '@media (max-width:480px){.nc-serv{padding:8px 10px;gap:10px}.nc-cook-btn{font-size:0.8125rem;padding:7px 12px}}';
    var s = document.createElement('style'); s.id='nc-styles'; s.textContent = css;
    document.head.appendChild(s);
  }

  /* ============================================================
   * INIT
   * ============================================================ */
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function(){
    try{ injectStyles(); }catch(e){}
    try{ injectCookMode(); }catch(e){ console.warn('[nandi-cook] cook mode:', e); }
    try{ injectServingCalculator(); }catch(e){ console.warn('[nandi-cook] calc:', e); }
    try{ injectFestivalRotator(); }catch(e){ console.warn('[nandi-cook] festival:', e); }
    try{ injectWAShare(); }catch(e){ console.warn('[nandi-cook] WA:', e); }
    // Re-run WA share after my-kitchen renders shopping list (it builds DOM async)
    if(detectType()==='kitchen'){
      setTimeout(function(){ try{ injectWAShare(); }catch(e){} }, 300);
      setTimeout(function(){ try{ injectWAShare(); }catch(e){} }, 800);
    }
  });
})();
