/** Re-read every lossless frame: conservative near-white width anywhere in the full image. */
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const out=process.argv[2];
if(!out?.startsWith('/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434d/'))throw new Error('Sai thư mục phiếu 434d');
const r=JSON.parse(readFileSync(join(out,'measure.json'),'utf8'));
r.rowWidthScan=[];
for(const view of ['top','behind']){
 const child=spawn('/opt/homebrew/bin/ffmpeg',['-v','error','-framerate','60','-i',join(out,'frames-'+view,'f%04d.png'),'-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
 const frame=Buffer.alloc(1280*720*3);let fill=0,count=0;let stderr='';child.stderr.on('data',c=>stderr+=c);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(stderr)));});
 for await(const chunk of child.stdout){let offset=0;while(offset<chunk.length){const n=Math.min(frame.length-fill,chunk.length-offset);chunk.copy(frame,fill,offset,offset+n);fill+=n;offset+=n;if(fill<frame.length)continue;
  let longest=0,run=0,white=0,near=0;
  for(let y=0;y<720;y++){run=0;for(let x=0;x<1280;x++){const i=(y*1280+x)*3,a=frame[i],b=frame[i+1],c=frame[i+2];if(a>=243&&b>=243&&c>=243)white++;if((a*.2126+b*.7152+c*.0722)/255>=.95){near++;run++;longest=Math.max(longest,run);}else run=0;}}
  r.rowWidthScan.push({view,frame:count++,time:(count-1)/60,whitePct:white/(1280*720)*100,nearWhitePct:near/(1280*720)*100,maxNearWhiteRowRunPx:longest,widthPct:longest/1280*100});fill=0;
 }}
 await done;if(count!==240||fill!==0)throw new Error('Thiếu khung '+view+': '+count);
}
r.pixelGate={definition:'Rec.709 >= 0.95; longest contiguous horizontal run anywhere in the full frame, a conservative bound for the trunk core',samples:r.rowWidthScan.length,maxNearWhiteRowRunPx:Math.max(...r.rowWidthScan.filter(x=>x.view==='behind').map(x=>x.maxNearWhiteRowRunPx)),maxWhitePct:Math.max(...r.rowWidthScan.map(x=>x.whitePct)),maxNearWhitePct:Math.max(...r.rowWidthScan.map(x=>x.nearWhitePct))};
r.pixelGate.pass=r.pixelGate.maxNearWhiteRowRunPx<=1280*.02&&r.pixelGate.maxWhitePct<=6&&r.pixelGate.maxNearWhitePct<=6;
writeFileSync(join(out,'measure.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r.pixelGate,null,2));
if(!r.pixelGate.pass)process.exitCode=1;
