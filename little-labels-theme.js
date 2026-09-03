(()=>{
  const C={navy:'#26354D',cream:'#FBF7EF',paper:'#FFFDF9',lav:'#DDD4EA',lav2:'#F0EBF6',lav3:'#C9BDD9',gold:'#C79A4A',muted:'#716E78',line:'#E6DFE8',sage:'#DDE7DA',blue:'#DCE7EF',blush:'#F1DDDC'};
  const css=document.createElement('style');
  css.id='littleLabelsTheme';
  css.textContent=`
    :root{--blue:${C.lav3}!important;--blue2:${C.lav2}!important;--ink:${C.navy}!important;--muted:${C.muted}!important;--line:${C.line}!important}
    html{background:${C.cream}!important} body{background:${C.cream}!important;color:${C.navy}!important;font-family:Arial,"Trebuchet MS",sans-serif!important}
    .app{padding:20px 16px 48px!important}
    h1,h2,h3{color:${C.navy}!important;letter-spacing:-.02em} h1{font-family:Georgia,"Times New Roman",serif!important;font-weight:500!important;font-size:2.25rem!important}
    .card{background:${C.paper}!important;border:1px solid ${C.line}!important;border-radius:24px!important;box-shadow:0 8px 28px rgba(38,53,77,.055)!important}
    button,.btn{border-radius:17px!important;transition:transform .12s ease,box-shadow .12s ease!important} button:active{transform:scale(.985)}
    .primary{background:${C.lav3}!important;color:${C.navy}!important;box-shadow:0 5px 14px rgba(87,69,111,.10)!important}
    .secondary{background:${C.paper}!important;color:${C.navy}!important;border:1px solid ${C.line}!important}
    .soft{background:${C.lav2}!important;color:${C.navy}!important}
    input,select,textarea{background:${C.paper}!important;color:${C.navy}!important;border-color:#D8CFDD!important}
    .choice{background:${C.paper}!important;border-color:${C.line}!important}.choice.selected{background:${C.lav2}!important;border-color:${C.lav3}!important}
    .pill{background:${C.lav2}!important;color:${C.navy}!important}
    .home-brand{text-align:center;padding:12px 8px 2px;margin-bottom:4px}.home-brand-parent{font-size:.69rem;letter-spacing:.24em;font-weight:700;color:${C.navy};text-transform:uppercase;margin-bottom:7px}.home-brand-parent .heart{color:${C.gold};font-size:.9rem;letter-spacing:0;margin:0 4px}.home-brand h1{margin:0!important}.home-brand-tag{font-size:.91rem;color:${C.muted};margin:7px auto 0;max-width:310px;line-height:1.4}
    #home>.muted:first-child,#home>h1,#home>h1+.muted{display:none!important}
    .home-create-title{font-size:.78rem!important;letter-spacing:.13em;text-transform:uppercase;color:${C.muted}!important;text-align:left!important;margin:24px 4px 10px!important}
    .home-create-grid{gap:11px!important}.home-action{min-height:145px!important;background:${C.paper}!important;border:1px solid ${C.line}!important;border-radius:24px!important;box-shadow:0 7px 22px rgba(38,53,77,.055)!important;padding:15px 11px!important}
    .home-action .home-icon{width:56px!important;height:56px!important;font-size:1.75rem!important;margin-bottom:9px!important;background:${C.lav2}!important;color:${C.navy}!important}
    .home-action:nth-of-type(2) .home-icon{background:${C.blue}!important}.home-action:nth-of-type(3) .home-icon{background:${C.sage}!important}.home-action:nth-of-type(4) .home-icon{background:${C.blush}!important}.home-action:nth-of-type(5) .home-icon{background:${C.lav2}!important}
    .home-action strong{color:${C.navy}!important;font-size:1rem!important}.home-action small{color:${C.muted}!important;font-size:.73rem!important;line-height:1.35!important}
    .home-manage-grid{margin-top:16px!important}.home-manage{background:${C.paper}!important;border:1px solid ${C.line}!important;border-radius:20px!important;box-shadow:0 5px 18px rgba(38,53,77,.045)!important;color:${C.navy}!important}.home-manage.print{background:#F5F0F8!important}.home-manage.labels{background:#F6F3ED!important}.home-count{background:${C.navy}!important;color:white!important}
    .home-account,.account-bar{background:transparent!important;border:0!important;border-top:1px solid ${C.line}!important;border-radius:0!important;margin-top:18px!important;padding-top:14px!important}.home-sync{color:#6C8067!important}.home-sync-dot{background:#8BA184!important}
    .camera-box{background:${C.paper}!important;border-color:${C.lav3}!important}.label-preview{background:linear-gradient(145deg,#F5F0F8,#FFFDF9)!important;border-color:${C.line}!important}.label-image-wrap,.label-text{border-color:${C.lav3}!important}.label-en{color:${C.navy}!important}
    .status.loading{background:#FBF2DD!important;color:#745D2E!important}.status.ok{background:#EEF4EA!important;color:#50634C!important}
    #nameLabelsOverlay{background:${C.cream}!important;color:${C.navy}!important}#nameLabelsOverlay .nl-card{background:${C.paper}!important;border-color:${C.line}!important;box-shadow:0 8px 28px rgba(38,53,77,.05)!important}#nameLabelsOverlay .nl-primary{background:${C.lav3}!important;color:${C.navy}!important}#nameLabelsOverlay .nl-tabs button.on,#nameLabelsOverlay .nl-option.on{background:${C.lav2}!important;border-color:${C.lav3}!important;color:${C.navy}!important}
    .footer-note{text-align:center!important;color:${C.muted}!important}
    @media(max-width:380px){h1{font-size:2rem!important}.home-action{min-height:136px!important}}
  `;
  document.head.appendChild(css);

  function brand(){
    document.title='Little Labels';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',C.cream);
    const home=document.getElementById('home');if(!home||home.querySelector('.home-brand'))return;
    const b=document.createElement('div');b.className='home-brand';
    b.innerHTML=`<div class="home-brand-parent">ONE <span class="heart">♥</span> LITTLE TEACHER</div><h1>Little Labels</h1><div class="home-brand-tag">Beautiful classroom labels, made simple.</div>`;
    home.prepend(b);
    const title=home.querySelector('.home-create-title');if(title)title.textContent='Create something';
    const rename=(id,strong,small)=>{const el=document.getElementById(id);if(!el)return;const s=el.querySelector('strong');const sm=el.querySelector('small');if(s)s.textContent=strong;if(sm)sm.textContent=small;};
    rename('homePhotoBtn','Take a Photo','Photograph a classroom item.');
    rename('homeGalleryBtn','Choose a Photo','Use a photo already on your phone.');
    rename('homeProductBtn','Product Link','Turn a product page into a label.');
    rename('homeListBtn','Make a List','Create a whole label set at once.');
    const nameBtn=[...document.querySelectorAll('.home-action')].find(x=>x.textContent.includes('Name Labels'));if(nameBtn){const sm=nameBtn.querySelector('small');if(sm)sm.textContent='Cubbies, chairs & student spaces.';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(brand,0),{once:true});else setTimeout(brand,0);
  window.addEventListener('load',()=>setTimeout(brand,150));
})();
