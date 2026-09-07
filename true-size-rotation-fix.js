(()=>{
  const base=window.rasterizeFinishedLabel;
  if(typeof base!=='function') return;

  function load(src){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=reject;
      img.src=src;
    });
  }

  window.rasterizeFinishedLabel=async function(item){
    const src=await base(item);
    if(!item?._rotated) return src;

    const img=await load(src);
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalHeight;
    canvas.height=img.naturalWidth;
    const ctx=canvas.getContext('2d');
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.rotate(Math.PI/2);
    ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
    return canvas.toDataURL('image/png');
  };
})();
