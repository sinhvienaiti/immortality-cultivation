/** 434i: package measured captures and the actual logged existing-audio mix. */
import {readFileSync,writeFileSync,copyFileSync,existsSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const repo='/Volumes/SS990TPRO/htdocs/typing-game',work=join(repo,'games/.wt-ic-lab-all');
const root='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434i',out=join(root,'round-3');
const owner='/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-17/tu-tien';
const magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf',ffmpeg='/opt/homebrew/bin/ffmpeg';
const read=p=>JSON.parse(readFileSync(p,'utf8')),m=read(join(out,'measure.json')),s=m.summary,life=read(join(root,'lifecycle.json'));
const rows=[1,2,3].map(k=>read(join(root,`round-${k}/measure.json`)).summary);
const gates={typecheck:process.env.TYPECHECK==='0',tiers:s.tierCounts[0]>=3&&s.tierCounts.filter(n=>n>0).length>=2,perSource:s.fanouts.every(f=>f.rays>=2&&f.rays<=4),angles:s.minLiveAngle>=40&&s.fanouts.every(f=>f.angles.every(a=>a>=40)),rays:s.maxRays<=24,column:s.columnFirst>=2.4-1e-8&&s.columnLast>=6-1/60-1e-8&&s.columnDurationS===3.6,white:s.scanFrames===840&&s.maxWhitePct<=6&&s.maxNearWhitePct<=6,p95:s.p95<=16.7,gpu:!/(swiftshader|software|unknown)/i.test(s.gpu),population:m.stress.runs.every(r=>r.population.targets+r.population.walkers===100),lifecycle:life.pass,cadence:life.frameCadenceMs.every(ms=>ms>=60&&ms<=120),pulses:life.pulseRuns.length===3,noExceptions:s.exceptions.length===0};
writeFileSync(join(root,'final-gates.json'),JSON.stringify({gates,rounds:rows,summary:s,lifecycle:life},null,2));
if(!Object.values(gates).every(Boolean))throw Error('Cổng chưa đạt: '+JSON.stringify(gates));
const jpg=join(owner,'thunder-codex-i.jpg'),mp4=join(owner,'thunder-codex-i.mp4');
if(existsSync(jpg)||existsSync(mp4))throw Error('Bản i đã tồn tại; không ghi đè');
const mix=execFileSync(process.execPath,['--import','tsx',join(work,'scripts/visual/mix-lab-sound.mjs'),join(out,'sound-takes.json'),join(out,'capture-mix.wav'),'--duration=7','--offset=0.016666666667','--root='+work],{cwd:work,encoding:'utf8',maxBuffer:2e6});writeFileSync(join(out,'sound-mix-log.txt'),mix);
execFileSync(ffmpeg,['-v','error','-threads','2','-framerate','60','-i',join(out,'frames-top/f%04d.png'),'-framerate','60','-i',join(out,'frames-behind/f%04d.png'),'-i',join(out,'capture-mix.wav'),'-filter_complex','[0:v]fps=30[a];[1:v]fps=30[b];[a][b]hstack=inputs=2[v]','-map','[v]','-map','2:a:0','-t','7','-c:v','libx264','-threads','2','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',mp4]);
copyFileSync(join(out,'comparison-sheet.jpg'),jpg);
const decoded=[];
for(const t of [1.2,2,2.5,4.2,5.8,6.5]){const f=join(out,`decoded-${t.toFixed(1)}s.png`);execFileSync(ffmpeg,['-v','error','-ss',String(t),'-i',mp4,'-frames:v','1',f]);decoded.push({t,file:f});}
execFileSync(magick,['montage','-font',font,'-pointsize','22','-fill','#dddfff',...decoded.flatMap(f=>['-label',`${f.t.toFixed(1)} s / Alt+1 | Alt+2`,f.file]),'-tile','2x3','-geometry','1280x360+3+3','-background','#10141b',join(out,'video-decoded-sheet.jpg')]);
for(const view of ['top','behind']){
 const frames=[144,150,156,162,168,174,180,186];
 execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#dddfff',...frames.flatMap(f=>['-label',`${view} / ${(f/60).toFixed(2)} s`,join(out,`frames-${view}/f${String(f).padStart(4,'0')}.png`)]),'-tile','2x4','-geometry','640x360+3+3','-background','#10141b',join(out,view+'-column-motion-sheet.jpg')]);
}
const video=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,codec_type,width,height,nb_read_frames,duration,avg_frame_rate','-of','json',mp4],{encoding:'utf8'}));
if(!video.streams.some(s=>s.codec_type==='video'&&s.nb_read_frames==='210'&&Number(s.duration)===7)||!video.streams.some(s=>s.codec_type==='audio'))throw Error('Sai định dạng clip');
writeFileSync(join(root,'video-info.json'),JSON.stringify(video,null,2));
const line=`434i: thunder-codex-i.jpg/.mp4 — ba tầng sét C ${s.tierCounts.join('/')} tia, góc thực nhỏ nhất ${s.minLiveAngle.toFixed(2)}°, tối đa ${s.maxRays} tia tính cả nhánh mây/dư điện; cột Ngũ Lôi 2,4–6,0 s, đổi hình 0,09 s, ba nhịp lóe hai khung; trắng ${s.maxWhitePct.toFixed(6)}% trên 840 khung, p95 Metal M4 ${s.p95.toFixed(2)} ms, kiểm kiểu 0 lỗi. Clip 7 giây/30 fps có âm Lôi nối lớp từ file sẵn có, hai camera đặt cạnh nhau. Giữ mọi bản cũ; chưa chấm mù mỹ thuật 8,5, âm chưa nghe chủ quan. Báo cáo docs/codex-queue/434i-report.md.`;
const about=join(owner,'ABOUT.md');if(!readFileSync(about,'utf8').includes('434i:'))appendFileSync(about,'\n'+line+'\n');
console.log(JSON.stringify({gates,summary:s,video,jpg,mp4},null,2));
