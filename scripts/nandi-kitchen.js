/* Nandi Kitchen — stickiness engine
 * Bookmarks, shopping list, universal search, reading progress, related recipes.
 * Pure client-side, localStorage-backed. No backend, no tracking.
 * v188 — Apr 2026
 */
(function(){
  'use strict';

  /* ---------- 1. STORAGE LAYER ---------- */
  var STORAGE_KEYS = {
    bookmarks: 'nandi_bookmarks_v1',
    shoppingList: 'nandi_shopping_list_v1',
    readLater: 'nandi_read_later_v1',
    emailCaptured: 'nandi_email_v1',
    visitCount: 'nandi_visit_count_v1'
  };

  function readStore(key, fallback){
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  }
  function writeStore(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  }

  /* ---------- 2. BOOKMARK ENGINE ---------- */
  // Stores: { recipes: [{slug,title,img,time,serves}], blogs: [...], products: [...] }
  var Bookmarks = {
    get: function(){ return readStore(STORAGE_KEYS.bookmarks, {recipes:[],blogs:[],products:[]}); },
    has: function(type, slug){
      var b = this.get(); var list = b[type]||[];
      for(var i=0;i<list.length;i++){ if(list[i].slug===slug) return true; }
      return false;
    },
    toggle: function(type, item){
      var b = this.get(); b[type] = b[type]||[];
      var idx = -1;
      for(var i=0;i<b[type].length;i++){ if(b[type][i].slug===item.slug){ idx=i; break; } }
      if(idx>=0){ b[type].splice(idx,1); writeStore(STORAGE_KEYS.bookmarks,b); return false; }
      b[type].unshift(item); writeStore(STORAGE_KEYS.bookmarks,b); return true;
    },
    count: function(){ var b=this.get(); return (b.recipes||[]).length+(b.blogs||[]).length+(b.products||[]).length; }
  };
  window.NandiBookmarks = Bookmarks;

  /* ---------- 3. SHOPPING LIST ---------- */
  // Ingredients aggregated across saved recipes; user can check off; "Order Nandi items" → Blinkit
  var NANDI_PRODUCTS_FOR_SHOPPING = [
    {match:/(nandi\s+)?atta|wheat flour|chakki/i, name:'Nandi Choker Sahit Atta', slug:'choker-sahit-atta', blinkit:'https://blinkit.com/prn/nandi-whole-wheat-chakki-fresh-atta/prid/587565'},
    {match:/(nandi\s+)?besan|gram flour/i, name:'Nandi Besan', slug:'besan', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?sooji|semolina|rava/i, name:'Nandi Sooji', slug:'sooji', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?maida|refined flour/i, name:'Nandi Maida', slug:'maida', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(chana\s+)?sattu/i, name:'Nandi Chana Sattu', slug:'chana-sattu', blinkit:'https://blinkit.com/prn/nandi-sattu/prid/617451'},
    {match:/(nandi\s+)?daliya|dalia/i, name:'Nandi Daliya', slug:'daliya', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(rock|pink|sendha)\s*(salt|namak)/i, name:'Nandi Himalayan Pink Salt', slug:'himalayan-pink-salt', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(sabji|veg)\s*masala/i, name:'Nandi Sabji Masala', slug:'sabji-masala', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?turmeric|haldi/i, name:'Nandi Turmeric Powder', slug:'turmeric-powder', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(red\s+chilli|lal mirch).*(powder)?/i, name:'Nandi Red Chilli Powder', slug:'red-chilli-powder', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?coriander|dhania/i, name:'Nandi Coriander Powder', slug:'coriander-powder', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?hing|asafoetida/i, name:'Nandi Hing Powder', slug:'hing-powder', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(mango|aam)\s*pickle/i, name:'Nandi Mango Pickle', slug:'mango-pickle', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(mix|mixed)\s*pickle/i, name:'Nandi Mix Pickle', slug:'mix-pickle', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(green chilli|hari mirch)\s*pickle/i, name:'Nandi Green Chilli Pickle', slug:'green-chilli-pickle', blinkit:'https://blinkit.com/'},
    {match:/(nandi\s+)?(red chilli|lal mirch)\s*pickle/i, name:'Nandi Red Chilli Pickle', slug:'red-chilli-pickle', blinkit:'https://blinkit.com/'}
  ];
  var ShoppingList = {
    get: function(){ return readStore(STORAGE_KEYS.shoppingList, {items:[],checked:{}}); },
    set: function(v){ writeStore(STORAGE_KEYS.shoppingList, v); },
    add: function(ingredient, fromRecipe){
      var s = this.get(); s.items = s.items||[];
      var key = ingredient.toLowerCase().trim();
      for(var i=0;i<s.items.length;i++){ if(s.items[i].key===key){ if(fromRecipe && s.items[i].recipes.indexOf(fromRecipe)<0) s.items[i].recipes.push(fromRecipe); this.set(s); return false; } }
      s.items.unshift({key:key, text:ingredient, recipes:fromRecipe?[fromRecipe]:[]});
      this.set(s); return true;
    },
    addMany: function(ingredients, fromRecipe){
      var added = 0; for(var i=0;i<ingredients.length;i++){ if(this.add(ingredients[i], fromRecipe)) added++; } return added;
    },
    remove: function(key){ var s=this.get(); s.items=(s.items||[]).filter(function(x){return x.key!==key;}); delete (s.checked||{})[key]; this.set(s); },
    removeByRecipe: function(recipeSlug){
      if(!recipeSlug) return 0;
      var s=this.get(); s.items=s.items||[]; s.checked=s.checked||{};
      var removed=0;
      s.items = s.items.filter(function(it){
        if(!it.recipes||!it.recipes.length) return true;
        var idx = it.recipes.indexOf(recipeSlug);
        if(idx<0) return true;
        it.recipes.splice(idx,1);
        if(it.recipes.length===0){ removed++; delete s.checked[it.key]; return false; }
        return true;
      });
      this.set(s); return removed;
    },
    toggle: function(key){ var s=this.get(); s.checked=s.checked||{}; s.checked[key]=!s.checked[key]; this.set(s); return s.checked[key]; },
    clear: function(){ this.set({items:[],checked:{}}); },
    count: function(){ return (this.get().items||[]).length; },
    matchNandi: function(text){
      for(var i=0;i<NANDI_PRODUCTS_FOR_SHOPPING.length;i++){
        if(NANDI_PRODUCTS_FOR_SHOPPING[i].match.test(text)) return NANDI_PRODUCTS_FOR_SHOPPING[i];
      }
      return null;
    }
  };
  window.NandiShoppingList = ShoppingList;

  /* ---------- 4. EMAIL CAPTURE ---------- */
  var EmailCapture = {
    isCaptured: function(){ return !!readStore(STORAGE_KEYS.emailCaptured, null); },
    save: function(email, source){
      writeStore(STORAGE_KEYS.emailCaptured, {email:email, source:source||'unknown', at:new Date().toISOString()});
      // Webhook submission. Falls back silently if endpoint not configured.
      try {
        if (window.NANDI_EMAIL_WEBHOOK) {
          fetch(window.NANDI_EMAIL_WEBHOOK, {
            method:'POST', mode:'no-cors',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({email:email, source:source||'unknown', page: location.pathname, ts: Date.now()})
          }).catch(function(){});
        }
      } catch(e){}
      return true;
    }
  };
  window.NandiEmail = EmailCapture;

  /* ---------- 5. SVG ICONS ---------- */
  var ICON = {
    bookmark: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    bookmarkFilled: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    cart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

  /* ---------- 6. BOOKMARK BUTTON INJECTION ---------- */
  // Recipe pages: inject after .recipe-meta-row
  // Blog pages: inject after first h1 in <article> or .blog-content
  // Product pages: inject in product hero
  function detectPageType(){
    var p = location.pathname;
    if(/\/recipes\/[a-z0-9\-]+\.html/.test(p)) return 'recipes';
    if(/\/blog\/[a-z0-9\-]+\.html/.test(p)) return 'blogs';
    if(/\/products\/[a-z0-9\-]+\.html/.test(p)) return 'products';
    return null;
  }
  function getSlug(){
    var p = location.pathname;
    var m = p.match(/\/(?:recipes|blog|products)\/([a-z0-9\-]+)\.html/);
    return m ? m[1] : null;
  }
  function getPageMeta(){
    var ogTitle = document.querySelector('meta[property="og:title"]');
    var ogImage = document.querySelector('meta[property="og:image"]');
    var ogDesc  = document.querySelector('meta[property="og:description"]');
    return {
      title: (ogTitle && ogTitle.content) || (document.querySelector('h1')||{}).textContent || document.title,
      img: (ogImage && ogImage.content) || '',
      desc: (ogDesc && ogDesc.content) || ''
    };
  }

  function makeBookmarkBtn(type, slug, item){
    var btn = document.createElement('button');
    btn.className = 'nk-bookmark-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', Bookmarks.has(type,slug) ? 'Remove bookmark' : 'Save to My Kitchen');
    btn.setAttribute('title', type==='recipes' ? (Bookmarks.has(type,slug) ? 'Saved · ingredients in shopping list · click to remove' : 'Save recipe · ingredients added to shopping list') : (Bookmarks.has(type,slug) ? 'Saved · click to remove' : 'Save to My Kitchen'));
    function render(){
      var saved = Bookmarks.has(type,slug);
      btn.innerHTML = (saved ? ICON.bookmarkFilled : ICON.bookmark) + '<span class="nk-bm-label">'+(saved?'Saved':'Save')+'</span>';
      btn.classList.toggle('nk-saved', saved);
    }
    render();
    btn.addEventListener('click', function(e){
      e.preventDefault();
      var nowSaved = Bookmarks.toggle(type, item);
      render();
      // Auto-sync shopping list for recipes
      var toastMsg = nowSaved ? 'Saved to My Kitchen' : 'Removed from My Kitchen';
      if(type==='recipes' && item.ingredients && item.ingredients.length){
        if(nowSaved){
          var added = ShoppingList.addMany(item.ingredients, slug);
          if(added>0) toastMsg = 'Saved · '+added+' ingredient'+(added===1?'':'s')+' added to shopping list';
        } else {
          var removed = ShoppingList.removeByRecipe(slug);
          if(removed>0) toastMsg = 'Removed · '+removed+' ingredient'+(removed===1?'':'s')+' cleared';
        }
      }
      showToast(toastMsg, nowSaved ? 'View →' : null, function(){ location.href = (location.pathname.indexOf('/recipes/')>=0||location.pathname.indexOf('/blog/')>=0||location.pathname.indexOf('/products/')>=0?'../':'') + 'my-kitchen.html'; });
    });
    return btn;
  }

  function injectBookmarkOnContentPage(){
    var type = detectPageType(); if(!type) return;
    var slug = getSlug(); if(!slug) return;
    var meta = getPageMeta();
    var item = {slug:slug, title: meta.title, img: meta.img, savedAt: Date.now(), type: type};

    // Capture extras for richer cards
    if(type==='recipes'){
      var metaRow = document.querySelector('.recipe-meta-row');
      if(metaRow){
        var tags = metaRow.querySelectorAll('.recipe-meta-tag');
        if(tags[0]) item.time = tags[0].textContent.trim();
        if(tags[1]) item.serves = tags[1].textContent.trim();
        // ingredients for shopping list
        var ingEls = document.querySelectorAll('.recipe-ingredients-list li');
        var ings = []; ingEls.forEach(function(el){ ings.push(el.textContent.trim()); });
        item.ingredients = ings;
      }
    }

    var btn = makeBookmarkBtn(type, slug, item);
    var anchor = null;
    if(type==='recipes') anchor = document.querySelector('.recipe-meta-row');
    else if(type==='blogs') anchor = document.querySelector('article h1, .blog-hero h1, .blog-content h1, h1');
    else if(type==='products') anchor = document.querySelector('.product-hero, .product-page-hero, h1');
    if(anchor && anchor.parentNode){
      var wrap = document.createElement('div'); wrap.className='nk-bookmark-wrap'; wrap.appendChild(btn);
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    }
  }

  /* ---------- 7. TOAST ---------- */
  var toastEl = null, toastTimer = null;
  function showToast(msg, actionLabel, actionFn){
    if(!toastEl){
      toastEl = document.createElement('div'); toastEl.className='nk-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = '<span>'+msg+'</span>'+(actionLabel?'<button class="nk-toast-action">'+actionLabel+'</button>':'');
    var ab = toastEl.querySelector('.nk-toast-action');
    if(ab && actionFn){ ab.addEventListener('click', function(){ actionFn(); }); }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 3500);
  }
  /* v192b: Expose toast globally for recipes listing save buttons */
  window.NandiToast = showToast;

  /* ---------- 8. UNIVERSAL SEARCH (loads index lazily) ---------- */
  // Index file generated at build time below; loaded on demand
  var SearchUI = {
    open: false,
    index: null,
    indexLoading: false,
    rootEl: null,
    init: function(){
      // Bind keyboard
      document.addEventListener('keydown', function(e){
        if((e.metaKey||e.ctrlKey) && e.key==='k'){ e.preventDefault(); SearchUI.toggle(); }
        else if(e.key==='Escape' && SearchUI.open){ SearchUI.close(); }
      });
      // Bind any existing trigger
      document.querySelectorAll('[data-nk-search-trigger]').forEach(function(el){
        el.addEventListener('click', function(e){ e.preventDefault(); SearchUI.toggle(); });
      });
    },
    loadIndex: function(){
      if(this.index || this.indexLoading) return;
      this.indexLoading = true;
      // figure out base path
      var base = (location.pathname.split('/').length>2 && location.pathname.indexOf('/recipes/')<0 && location.pathname.indexOf('/blog/')<0 && location.pathname.indexOf('/products/')<0) ? './' : ((location.pathname.indexOf('/recipes/')>=0||location.pathname.indexOf('/blog/')>=0||location.pathname.indexOf('/products/')>=0)?'../':'./');
      var self=this;
      fetch(base+'nandi-search-index.json').then(function(r){return r.json();}).then(function(j){ self.index=j; self.indexLoading=false; if(self.open) self.runQuery(); }).catch(function(){ self.indexLoading=false; });
    },
    toggle: function(){ this.open ? this.close() : this.openModal(); },
    openModal: function(){
      this.loadIndex();
      if(!this.rootEl){ this.build(); }
      this.rootEl.classList.add('open');
      this.open = true;
      var input = this.rootEl.querySelector('.nk-search-input');
      setTimeout(function(){ input && input.focus(); }, 50);
      document.body.style.overflow='hidden';
    },
    close: function(){
      if(this.rootEl) this.rootEl.classList.remove('open');
      this.open = false;
      document.body.style.overflow='';
    },
    build: function(){
      var html =
        '<div class="nk-search-overlay" data-close="1"></div>'+
        '<div class="nk-search-panel" role="dialog" aria-label="Search Nandi">'+
          '<div class="nk-search-header">'+
            '<span class="nk-search-icon">'+ICON.search+'</span>'+
            '<input class="nk-search-input" type="search" placeholder="Search recipes, blogs, products..." autocomplete="off" />'+
            '<button class="nk-search-close" type="button" aria-label="Close">'+ICON.close+'</button>'+
          '</div>'+
          '<div class="nk-search-results" aria-live="polite"></div>'+
          '<div class="nk-search-footer"><span class="nk-kbd">esc</span> to close · <span class="nk-kbd">⌘K</span> to open</div>'+
        '</div>';
      var wrap = document.createElement('div');
      wrap.className='nk-search-root'; wrap.innerHTML = html;
      document.body.appendChild(wrap);
      this.rootEl = wrap;
      var self=this;
      wrap.addEventListener('click', function(e){ if(e.target.dataset && e.target.dataset.close) self.close(); });
      wrap.querySelector('.nk-search-close').addEventListener('click', function(){ self.close(); });
      var input = wrap.querySelector('.nk-search-input');
      var debounce = null;
      input.addEventListener('input', function(){ clearTimeout(debounce); debounce=setTimeout(function(){ self.runQuery(); }, 100); });
      this.runQuery();
    },
    runQuery: function(){
      if(!this.rootEl) return;
      var q = (this.rootEl.querySelector('.nk-search-input').value||'').toLowerCase().trim();
      var results = this.rootEl.querySelector('.nk-search-results');
      if(!this.index){
        results.innerHTML = '<div class="nk-empty">Loading…</div>';
        return;
      }
      if(!q){
        // Trending: pinned popular items
        var pin = (this.index.pinned||[]).slice(0,8);
        results.innerHTML = '<div class="nk-search-cat">Popular</div>' + pin.map(this.renderItem).join('') || '<div class="nk-empty">Start typing</div>';
        return;
      }
      var hits = [];
      this.index.items.forEach(function(it){
        var hay = (it.title+' '+(it.tags||'')+' '+(it.snippet||'')).toLowerCase();
        if(hay.indexOf(q)>=0){
          var score = 0;
          if(it.title.toLowerCase().indexOf(q)===0) score+=10;
          else if(it.title.toLowerCase().indexOf(q)>=0) score+=5;
          score += {recipes:3,products:2,blogs:1,recipe:3,product:2,blog:1}[it.type]||0;
          hits.push({it:it,score:score});
        }
      });
      hits.sort(function(a,b){return b.score-a.score;});
      hits = hits.slice(0,12);
      if(!hits.length){
        results.innerHTML = '<div class="nk-empty">No matches for "<strong>'+q+'</strong>"</div>';
        return;
      }
      var grouped = {recipe:[],product:[],blog:[]};
      var typeMap = {recipes:'recipe', products:'product', blogs:'blog'};
      hits.forEach(function(h){ var t = typeMap[h.it.type]||h.it.type||'blog'; (grouped[t]||grouped.blog).push(h.it); });
      var out='';
      var titles = {recipe:'Recipes', product:'Products', blog:'Blogs'};
      ['recipe','product','blog'].forEach(function(k){
        if(grouped[k].length){
          out += '<div class="nk-search-cat">'+titles[k]+'</div>';
          out += grouped[k].map(SearchUI.renderItem).join('');
        }
      });
      results.innerHTML = out;
    },
    renderItem: function(it){
      var basePrefix = (location.pathname.indexOf('/recipes/')>=0||location.pathname.indexOf('/blog/')>=0||location.pathname.indexOf('/products/')>=0)?'../':'./';
      return '<a class="nk-search-item" href="'+basePrefix+it.url+'">'+
        '<span class="nk-search-thumb">'+(it.img?'<img src="'+basePrefix+it.img+'" alt="" loading="lazy">':'')+'</span>'+
        '<span class="nk-search-text">'+
          '<span class="nk-search-title">'+it.title+'</span>'+
          (it.snippet?'<span class="nk-search-snippet">'+it.snippet+'</span>':'')+
        '</span>'+
      '</a>';
    }
  };
  window.NandiSearch = SearchUI;

  /* ---------- 9. READING PROGRESS BAR ---------- */
  function initReadingProgress(){
    var type = detectPageType();
    if(type!=='blogs' && type!=='recipes') return;
    var bar = document.createElement('div');
    bar.className='nk-progress-bar'; bar.innerHTML='<span></span>';
    document.body.appendChild(bar);
    var fill = bar.firstChild;
    function update(){
      var h = document.documentElement;
      var scrolled = h.scrollTop;
      var max = h.scrollHeight - h.clientHeight;
      var pct = max>0 ? Math.min(100, Math.max(0, (scrolled/max)*100)) : 0;
      fill.style.width = pct+'%';
    }
    window.addEventListener('scroll', update, {passive:true});
    update();
  }

  /* ---------- 10. STYLES ---------- */
  function injectStyles(){
    if(document.getElementById('nk-styles')) return;
    var css = ''+
      /* Bookmark button */
      '.nk-bookmark-wrap{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 var(--space-6,24px) 0}'+
      '.nk-bookmark-btn,.nk-shop-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;border:1.5px solid #C8A35F;background:#fff;color:#1a1207;font-family:inherit;font-size:0.9375rem;font-weight:600;cursor:pointer;transition:all 0.2s ease;line-height:1}'+
      '.nk-bookmark-btn:hover,.nk-shop-btn:hover{background:#FFF8E8;transform:translateY(-1px);box-shadow:0 4px 14px rgba(200,163,95,0.25)}'+
      '.nk-bookmark-btn.nk-saved{background:#1a1207;color:#C8A35F;border-color:#1a1207}'+
      '.nk-bookmark-btn.nk-saved:hover{background:#2a1f10}'+
      '.nk-shop-btn{background:#F8C200;border-color:#F8C200;color:#1a1207}'+
      '.nk-shop-btn:hover{background:#e6b400;border-color:#e6b400}'+
      /* Toast */
      '.nk-toast{position:fixed;bottom:96px;left:50%;transform:translate(-50%,20px);background:#1a1207;color:#FAF5E8;padding:14px 20px;border-radius:14px;display:flex;align-items:center;gap:12px;font-size:0.9375rem;font-weight:500;box-shadow:0 12px 40px rgba(26,18,7,0.35);opacity:0;pointer-events:none;transition:all 0.25s ease;z-index:10050;max-width:90vw}'+
      '.nk-toast.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}'+
      '.nk-toast-action{background:#C8A35F;color:#1a1207;border:none;padding:6px 12px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:0.875rem}'+
      /* Search overlay */
      '.nk-search-root{position:fixed;inset:0;z-index:10080;display:none}'+
      '.nk-search-root.open{display:block}'+
      '.nk-search-overlay{position:absolute;inset:0;background:rgba(15,10,5,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}'+
      '.nk-search-panel{position:relative;max-width:640px;margin:8vh auto 0;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(26,18,7,0.35);overflow:hidden;font-family:inherit}'+
      '.nk-search-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #F1E8D6}'+
      '.nk-search-icon{color:#8a7355;display:flex}'+
      '.nk-search-input{flex:1;border:none;outline:none;font-family:inherit;font-size:1.0625rem;color:#1a1207;background:transparent}'+
      '.nk-search-close{background:#F5EDE0;border:none;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#1a1207}'+
      '.nk-search-results{max-height:60vh;overflow-y:auto;padding:8px 0}'+
      '.nk-search-cat{padding:10px 18px 6px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:#8a7355;font-weight:700}'+
      '.nk-search-item{display:flex;align-items:center;gap:12px;padding:10px 18px;text-decoration:none;color:#1a1207;transition:background 0.15s}'+
      '.nk-search-item:hover{background:#FAF5E8}'+
      '.nk-search-thumb{width:44px;height:44px;border-radius:10px;background:#F5EDE0;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center}'+
      '.nk-search-thumb img{width:100%;height:100%;object-fit:cover}'+
      '.nk-search-text{display:flex;flex-direction:column;min-width:0;flex:1}'+
      '.nk-search-title{font-weight:600;font-size:0.9375rem;color:#1a1207}'+
      '.nk-search-snippet{font-size:0.8125rem;color:#6e5d3f;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
      '.nk-empty{padding:32px 18px;text-align:center;color:#8a7355;font-size:0.9375rem}'+
      '.nk-search-footer{padding:10px 18px;border-top:1px solid #F1E8D6;font-size:0.75rem;color:#8a7355;text-align:center}'+
      '.nk-kbd{display:inline-block;padding:2px 6px;background:#F5EDE0;border-radius:4px;font-family:monospace;font-size:0.7rem;border:1px solid #E5D4B0}'+
      /* Reading progress */
      '.nk-progress-bar{position:fixed;top:0;left:0;right:0;height:3px;background:transparent;z-index:9999;pointer-events:none}'+
      '.nk-progress-bar span{display:block;height:100%;width:0;background:linear-gradient(90deg,#C8A35F,#e6b400);transition:width 0.05s linear}'+
      /* Search trigger */
      '.nk-search-trigger{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #E5D4B0;background:#fff;border-radius:999px;font-family:inherit;font-size:0.875rem;color:#6e5d3f;cursor:pointer;transition:all 0.2s}'+
      '.nk-search-trigger:hover{border-color:#C8A35F;color:#1a1207;background:#FFF8E8}'+
      '.nk-search-trigger .nk-kbd{background:#FAF5E8}'+
      '@media (max-width:768px){.nk-search-panel{margin:0;border-radius:0;height:100vh;max-width:100%}.nk-search-results{max-height:calc(100vh - 110px)}.nk-toast{bottom:100px;font-size:0.875rem;padding:12px 16px}}';
    var s = document.createElement('style'); s.id='nk-styles'; s.textContent=css;
    document.head.appendChild(s);
  }

  /* ---------- 11. INIT ---------- */
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function(){
    injectStyles();
    SearchUI.init();
    initReadingProgress();
    injectBookmarkOnContentPage();
    // Track visit count (used for first-time-visit signup nudge logic, optional)
    var v = (readStore(STORAGE_KEYS.visitCount,0)||0)+1; writeStore(STORAGE_KEYS.visitCount,v);
  });
})();
