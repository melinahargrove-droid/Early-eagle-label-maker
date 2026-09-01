(()=>{
  const CP_TEMPLATE_URL='https://www.communityplaythings.com/-/media/Files/CPUS/Product-Information/Compact-Cubby-Label-Template.ashx?la=en&rev=a9e31b296ff0486eb1d329ea059ade6f&hash=F61DB274C98186C12B45D4E245139A6B';
  let students=[];
  let style='name';
  let labelType='business';
  let copies=1;

  function addStyles(){
    const s=document.createElement('style');
    s.textContent=`
      #nameLabelsOverlay{position:fixed;inset:0;background:#f7fbff;z-index:10000;overflow:auto;color:#17324d;font-family:"Trebuchet MS",Arial,sans-serif}
      #nameLabelsOverlay .nl-app{max-width:560px;margin:auto;padding:18px 16px 45px}
      .nl-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.nl-head button{width:auto;padding:10px 13px}
      .nl-card{background:#fff;border:1px solid #d9e3ec;border-radius:20px;padding:15px;margin:12px 0}.nl-card h3{margin:0 0 8px}
      .nl-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.nl-tabs button{border:1px solid #d9e3ec;background:#fff;color:#17324d}.nl-tabs button.on{background:#1f5f9d;color:#fff}
      #nlNames{width:100%;min-height:180px;padding:13px;border:1px solid #bccad6;border-radius:14px;font:inherit;resize:vertical}
      .nl-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.nl-option{border:2px solid #d9e3ec;border-radius:16px;padding:12px;cursor:pointer}.nl-option.on{border-color:#1f5f9d;background:#eaf4ff}.nl-option strong{display:block}.nl-option small{color:#66788a}
      .nl-primary{background:#1f5f9d;color:#fff}.nl-secondary{background:#fff;color:#17324d;border:1px solid #d9e3ec}.nl-hidden{display:none!important}
      .nl-student{display:grid;grid-template-columns:64px 1fr auto;gap:10px;align-items:center;border-top:1px solid #e4ebf1;padding:10px 0}.nl-photo{width:64px;height:64px;border-radius:12px;object-fit:cover;background:#eef5fb;border:1px solid #d9e3ec}.nl-student button{width:auto;padding:8px 10px;font-size:.8rem}
      .nl-preview-card{height:150px;border:1px solid #a9bfd2;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;overflow:hidden}.nl-preview-card.cp{border-radius:18px 18px 45% 45%/18px 18px 35% 35%}.nl-preview-card img{width:70px;height:70px;object-fit:cover;border-radius:10px}.nl-name{font-size:2rem;font-weight:800;text-align:center;color:#17324d;line-height:1}
      @media print{body>*:not(#nlPrintRoot){display:none!important}#nlPrintRoot{display:block!important}}
    `; document.head.appendChild(s);
  }

  function parseNames(){return document.getElementById('nlNames').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);}
  function syncStudents(){
    const names=parseNames(); const old=new Map(students.map(s=>[s.name,s]));
    students=names.map(name=>old.get(name)||{name,photo:''}); renderStudents(); updateCount(); renderPreview();
  }
  function updateCount(){const e=document.getElementById('nlCount');if(e)e.textContent=`${students.length} student${students.length===1?'':'s'} · ${copies} cop${copies===1?'y':'ies'} each`;}
  function setStyle(v){style=v;document.querySelectorAll('[data-nl-style]').forEach(x=>x.classList.toggle('on',x.dataset.nlStyle===v));document.getElementById('nlPhotoList').classList.toggle('nl-hidden',v!=='photo');renderPreview();}
  function setType(v){labelType=v;document.querySelectorAll('[data-nl-type]').forEach(x=>x.classList.toggle('on',x.dataset.nlType===v));renderPreview();}
  function renderStudents(){
    const wrap=document.getElementById('nlPhotoList'); if(!wrap)return; wrap.innerHTML='';
    students.forEach((st,i)=>{
      const row=document.createElement('div');row.className='nl-student';
      const img=document.createElement('img');img.className='nl-photo';if(st.photo)img.src=st.photo;
      const name=document.createElement('strong');name.textContent=st.name;
      const b=document.createElement('button');b.className='nl-secondary';b.textContent=st.photo?'Change':'Add Photo';
      b.onclick=()=>choosePhoto(i); row.append(img,name,b);wrap.append(row);
    });
  }
  function choosePhoto(i){
    const input=document.createElement('input');input.type='file';input.accept='image/*';input.capture='user';input.style.display='none';
    input.onchange=()=>{const f=input.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{students[i].photo=r.result;renderStudents();renderPreview();input.remove();};r.readAsDataURL(f);};document.body.append(input);input.click();
  }
  function renderPreview(){
    const p=document.getElementById('nlPreview');if(!p)return;const st=students[0]||{name:'Student Name',photo:''};
    p.className='nl-preview-card'+(labelType==='cp'?' cp':'');p.innerHTML='';
    if(style==='photo'){const img=document.createElement('img');if(st.photo)img.src=st.photo;p.append(img);}
    const n=document.createElement('div');n.className='nl-name';n.textContent=st.name;p.append(n);
  }

  function open(){document.getElementById('nameLabelsOverlay').classList.remove('nl-hidden');window.scrollTo(0,0);}
  function close(){document.getElementById('nameLabelsOverlay').classList.add('nl-hidden');}

  function printLabels(){
    syncStudents(); if(!students.length){alert('Add at least one student name.');return;}
    const items=[];students.forEach(st=>{for(let i=0;i<copies;i++)items.push(st);});
    const root=document.getElementById('nlPrintRoot');root.innerHTML='';
    const perPage=labelType==='cp'?5:10;
    for(let start=0;start<items.length;start+=perPage){
      const page=document.createElement('div');page.style.cssText='position:relative;width:8.5in;height:11in;page-break-after:always;background:white;';
      items.slice(start,start+perPage).forEach((st,j)=>{
        const el=document.createElement('div');
        if(labelType==='business'){
          const col=j%2,row=Math.floor(j/2);el.style.cssText=`position:absolute;left:${.55+col*3.75}in;top:${.45+row*2.08}in;width:3.375in;height:2in;border:1px dashed #aaa;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:.15in;padding:.12in;overflow:hidden;background:#fff;`;
        }else{
          // Five-up portrait arrangement matching the official CP template's five-label sheet concept.
          el.style.cssText=`position:absolute;left:1.15in;top:${.55+j*2.05}in;width:6.2in;height:1.82in;border:1px solid #777;border-radius:.12in .12in 45% 45%/.12in .12in 34% 34%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:.18in;padding:.14in .45in .35in;overflow:hidden;background:#fff;`;
        }
        if(style==='photo'&&st.photo){const img=document.createElement('img');img.src=st.photo;img.style.cssText='width:.9in;height:.9in;object-fit:cover;border-radius:.08in;';el.append(img);}
        const name=document.createElement('div');name.textContent=st.name;name.style.cssText=`font-family:Arial,sans-serif;font-weight:800;text-align:center;color:#111;line-height:1;font-size:${labelType==='cp'?'28pt':'26pt'};`;el.append(name);page.append(el);
      });root.append(page);
    }
    const oldTitle=document.title;document.title='Name Labels';window.print();setTimeout(()=>{document.title=oldTitle;},500);
  }

  function install(){
    addStyles();
    const overlay=document.createElement('div');overlay.id='nameLabelsOverlay';overlay.className='nl-hidden';overlay.innerHTML=`<div class="nl-app">
      <div class="nl-head"><button id="nlBack" class="nl-secondary">← Back</button><div><h2 style="margin:0">Name Labels</h2><div style="color:#66788a;font-size:.9rem">Create a whole class set at once.</div></div></div>
      <div class="nl-card"><h3>1. Student Names</h3><textarea id="nlNames" placeholder="Type or paste one name per line…"></textarea><div id="nlCount" style="margin-top:7px;color:#66788a">0 students</div></div>
      <div class="nl-card"><h3>2. Label Style</h3><div class="nl-tabs"><button class="on" data-nl-style="name">Name Only</button><button data-nl-style="photo">Name + Photo</button></div><div id="nlPhotoList" class="nl-hidden" style="margin-top:10px"></div></div>
      <div class="nl-card"><h3>3. Label Type</h3><div class="nl-row"><div class="nl-option on" data-nl-type="business"><strong>Business Card</strong><small>3.375 × 2 in</small></div><div class="nl-option" data-nl-type="cp"><strong>CP Compact Cubby</strong><small>Curved cubby insert</small></div></div><p style="font-size:.78rem;color:#66788a;margin:10px 0 0">CP format is based on the Community Playthings Compact Cubby label template.</p></div>
      <div class="nl-card"><h3>4. Copies Per Student</h3><select id="nlCopies" style="width:100%;padding:12px;border:1px solid #bccad6;border-radius:12px"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
      <div class="nl-card"><h3>Preview</h3><div id="nlPreview" class="nl-preview-card"><div class="nl-name">Student Name</div></div></div>
      <button id="nlPrint" class="nl-primary">Create & Print Name Labels</button>
      <a href="${CP_TEMPLATE_URL}" target="_blank" style="display:block;text-align:center;margin-top:12px;font-size:.8rem">View official CP template</a>
    </div>`;document.body.append(overlay);
    const root=document.createElement('div');root.id='nlPrintRoot';root.style.display='none';document.body.append(root);
    document.getElementById('nlBack').onclick=close;document.getElementById('nlNames').addEventListener('input',syncStudents);
    document.querySelectorAll('[data-nl-style]').forEach(b=>b.onclick=()=>setStyle(b.dataset.nlStyle));document.querySelectorAll('[data-nl-type]').forEach(b=>b.onclick=()=>setType(b.dataset.nlType));
    document.getElementById('nlCopies').onchange=e=>{copies=Number(e.target.value)||1;updateCount();};document.getElementById('nlPrint').onclick=printLabels;

    // Add Name Labels as a first-class home action without disturbing existing actions.
    const grid=document.querySelector('.home-create-grid');if(grid){const b=document.createElement('button');b.className='home-action';b.innerHTML='<span class="home-icon">👤</span><strong>Name Labels</strong><small>Names for cubbies, chairs & more</small>';b.onclick=open;grid.append(b);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
