/** 434l: gate and package the scoped lab captures; preserve every older owner file. */
import {readFileSync,writeFileSync,copyFileSync,existsSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const repo='/Volumes/SS990TPRO/htdocs/typing-game',work=join(repo,'games/.wt-ic-lab-all');
const root='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434l',out=join(root,'round-3');
const owner='/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-18/tu-tien';
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf',ffmpeg='/opt/homebrew/bin/ffmpeg';
const read=p=>JSON.parse(readFileSync(p,'utf8')),m=read(join(out,'measure.json')),s=m.summary;
const rows=[1,3].map(k=>read(join(root,`round-${k}/measure.json`)).summary),cols=s.columns;
const takes=read(join(out,'sound-takes.json')),columnTakes=takes.filter(t=>t.group==='big'&&t.url?.endsWith('/tt-sfx-pillar-thunder/take1.wav'));
// The visual event lands on the next 60 Hz frame; the lab logs against that frame's start.
const soundChecks=columnTakes.map((t,i)=>{const expectedAt=Math.ceil(cols[i].at*60-1e-7)/60+cols[i].delay;
 return {at:t.at+1/60,rate:t.rate,pan:t.pan,expectedAt,match:Math.abs(t.at+1/60-expectedAt)<1e-7&&Math.abs(t.rate-cols[i].rate)<1e-8};});
const gates={
 typecheck:process.env.TYPECHECK==='0',spread:s.chainWidths.filter(p=>p.view==='top').every(p=>p.widthPct>=60),
 tiers:s.tierCounts.length>=3&&s.tierCounts.length<=4&&s.tierCounts.every(n=>n>0),
 fanouts:s.fanouts.every(f=>f.rays>=2&&f.rays<=4&&f.angles.every(a=>a>=40)),angles:s.minLiveAngle>=40,rays:s.maxRays<=24,
 columns:s.columnCount>=6&&s.columnCount<=7,overlap:s.maxColumnsAtOnce>=2&&s.maxColumnsAtOnce<=4,spacing:s.minLandingDistanceM>=5,
 lifespan:cols.every(c=>c.life>=.5&&c.life<=.9&&c.at>=2.4&&c.at+c.life<=6+1e-8),
 final:cols.filter(c=>c.final).length===1&&cols.at(-1).final&&cols.at(-1).width>Math.max(...cols.slice(0,-1).map(c=>c.width))&&cols.at(-1).density>=Math.max(...cols.map(c=>c.density)),
 sound:columnTakes.length===cols.length&&soundChecks.every(c=>c.match)&&new Set(columnTakes.map(t=>t.rate)).size===cols.length,
 white:s.scanFrames===840&&s.maxWhitePct<=6&&s.maxNearWhitePct<=6,p95:s.p95<=16.7,gpu:!/(swiftshader|software|unknown)/i.test(s.gpu),
 population:m.stress.runs.every(r=>r.population.targets+r.population.walkers===100&&r.populationEnd.targets+r.populationEnd.walkers===100),
 veins:s.veinMinPct>=8,noDrops:s.maxDropped===0,noExceptions:s.exceptions.length===0
};
writeFileSync(join(root,'final-gates.json'),JSON.stringify({gates,rounds:rows,summary:s,soundChecks},null,2));
if(!Object.values(gates).every(Boolean))throw Error('Cổng chưa đạt: '+JSON.stringify(gates));
mkdirSync(owner,{recursive:true});const jpg=join(owner,'thunder-art-l.jpg'),mp4=join(owner,'thunder-art-l.mp4');
if(existsSync(jpg)||existsSync(mp4))throw Error('Bản j đã tồn tại; không ghi đè');
const mix=execFileSync(process.execPath,['--import','tsx',join(work,'scripts/visual/mix-lab-sound.mjs'),join(out,'sound-takes.json'),join(out,'capture-mix.wav'),'--duration=7','--offset=0.016666666667','--root='+work],{cwd:work,encoding:'utf8',maxBuffer:2e6});writeFileSync(join(out,'sound-mix-log.txt'),mix);
execFileSync(ffmpeg,['-v','error','-threads','2','-framerate','60','-i',join(out,'frames-top/f%04d.png'),'-framerate','60','-i',join(out,'frames-behind/f%04d.png'),'-i',join(out,'capture-mix.wav'),'-filter_complex','[0:v]fps=30[a];[1:v]fps=30[b];[a][b]hstack=inputs=2[v]','-map','[v]','-map','2:a:0','-t','7','-c:v','libx264','-threads','2','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',mp4]);
copyFileSync(join(out,'comparison-sheet.jpg'),jpg);
const decoded=[];
for(const t of [1.2,2,3,4.2,5.5,6.5]){const file=join(out,`decoded-${t.toFixed(1)}s.png`);execFileSync(ffmpeg,['-v','error','-ss',String(t),'-i',mp4,'-frames:v','1',file]);decoded.push({t,file});}
execFileSync(magick,['montage','-font',font,'-pointsize','22','-fill','#dddfff',...decoded.flatMap(f=>['-label',`${f.t.toFixed(1)} s / Alt+1 | Alt+2`,f.file]),'-tile','2x3','-geometry','1280x360+3+3','-background','#10141b',join(out,'video-decoded-sheet.jpg')]);
// One panel per distinct landing, plus the last column's changing shapes.
for(const view of ['top','behind']){
 const frames=cols.map(c=>Math.round((c.at+.1)*60));
 execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#dddfff',...frames.flatMap((f,i)=>['-label',`${view} / column ${i+1} / ${(f/60).toFixed(2)} s`,join(out,`frames-${view}/f${String(f).padStart(4,'0')}.png`)]),'-tile','2x4','-geometry','640x360+3+3','-background','#10141b',join(out,view+'-seven-landings-sheet.jpg')]);
 const motion=[309,315,321,327,333,339,345,351];
 execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#dddfff',...motion.flatMap(f=>['-label',`${view} / ${(f/60).toFixed(2)} s`,join(out,`frames-${view}/f${String(f).padStart(4,'0')}.png`)]),'-tile','2x4','-geometry','640x360+3+3','-background','#10141b',join(out,view+'-final-motion-sheet.jpg')]);
}
const video=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,codec_type,width,height,nb_read_frames,duration,avg_frame_rate','-of','json',mp4],{encoding:'utf8'}));
if(!video.streams.some(s=>s.codec_type==='video'&&s.nb_read_frames==='210'&&Number(s.duration)===7)||!video.streams.some(s=>s.codec_type==='audio'))throw Error('Sai định dạng clip');
writeFileSync(join(root,'video-info.json'),JSON.stringify(video,null,2));
const line=`434l: thunder-art-l.jpg/.mp4 — sét C lan bốn tầng ${s.tierCounts.join('/')} tia, phủ ngang ${s.chainWidthPct.toFixed(2)}%, góc thực nhỏ nhất ${s.minLiveAngle.toFixed(2)}°, tối đa ${s.maxRays} tia; 7 cột ở 7 điểm cách nhau tối thiểu ${s.minLandingDistanceM.toFixed(2)} m, tối đa ${s.maxColumnsAtOnce} cột chồng, sống 0,84–0,90 s và đổi hình mỗi 0,09 s; cột cuối lớn nhất vào cụm đông nhất. Gân mây phủ tối thiểu ${s.veinMinPct.toFixed(2)}% dải mây. Trắng ${s.maxWhitePct.toFixed(6)}% trên 840 khung, p95 Metal M4 ${s.p95.toFixed(2)} ms, kiểm kiểu 0 lỗi. Clip 7 giây/30 fps có 7 tiếng sét lệch cao độ và thời điểm; giữ các bản cũ. Chưa chấm mù mỹ thuật 8,5 và chưa nghe đánh giá chủ quan. Báo cáo docs/codex-queue/434l-report.md.`;
const about=join(owner,'ABOUT.md');if(!existsSync(about))writeFileSync(about,'purpose: owner review 18/11 Tu Tien\nmade-by: Claude\ndoc: docs/codex-queue/434l-report.md\ndelete-when: owner duyệt xong\n');if(!readFileSync(about,'utf8').includes('434l:'))appendFileSync(about,'\n'+line+'\n');
console.log(JSON.stringify({gates,chainWidthPct:s.chainWidthPct,maxRays:s.maxRays,columnCount:s.columnCount,maxColumnsAtOnce:s.maxColumnsAtOnce,minLandingDistanceM:s.minLandingDistanceM,maxWhitePct:s.maxWhitePct,p95:s.p95,soundChecks,video,jpg,mp4},null,2));
