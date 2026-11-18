/** 434h: package only this ticket's captures; preserve every previous owner artifact. */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const root='/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434h';
const owner='/Volumes/SS990TPRO/htdocs/typing-game-review/owner-review/2026-11-17/tu-tien';
const out=join(root,'round-3'), magick='/opt/homebrew/bin/magick',font='/System/Library/Fonts/Supplemental/Arial.ttf';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const m=read(join(out,'measure.json'));
const rows=[1,2,3].map(k=>{const r=read(join(root,`round-${k}/measure.json`));return {round:k,hops:r.hopSummary,maxWhitePct:Math.max(...r.phases.map(p=>p.whitePct),...r.scan.map(p=>p.whitePct)),p95:r.stress.p95TotalMs};});
const f=read('/Volumes/SS990TPRO/htdocs/typing-game-review/captures/tu-tien/thunder-ult-434f/round-4/measure.json');
const select=d=>d.hops.map(h=>({at:h.at,start:h.start,end:h.end,turnDeg:h.turnDeg}));
const preserved=d=>d.phases.filter(p=>[2.2,3].includes(p.t)).map(p=>({view:p.view,t:p.t,climax:p.state.climax,art:p.state.art.links.filter(l=>!l.layer.startsWith('bolt')),cloud:p.cloud.dense}));
const gates={hopBody:m.hopSummary.every(h=>h.bodyPx>=14),coverage:m.hopSummary.every(h=>h.coveragePct>=90&&h.startGapPx===0&&h.endGapPx===0),white:m.scan.length===480&&Math.max(...m.scan.map(p=>p.whitePct),...m.phases.map(p=>p.whitePct))<=6,p95:m.stress.p95TotalMs<=16.7,cloud:m.denseGate,zigzag:m.turnGate,unchangedHopPath:JSON.stringify(select(m))===JSON.stringify(select(f)),unchangedColumnGroundCloud:JSON.stringify(preserved(m))===JSON.stringify(preserved(f)),noExceptions:m.exceptions.length===0};
writeFileSync(join(root,'final-gates.json'),JSON.stringify({gates,rounds:rows,whiteSamples:m.scan.length,maxWhitePct:Math.max(...m.scan.map(p=>p.whitePct),...m.phases.map(p=>p.whitePct)),maxNearWhitePct:Math.max(...m.scan.map(p=>p.nearWhitePct),...m.phases.map(p=>p.nearWhitePct)),gpu:m.stress.gpu},null,2));
for(const view of ['top','behind']){
 const inputs=[.65,.75,.85,.95,1.05,1.15,1.25,1.35].map(t=>Math.round(t*60));
 execFileSync(magick,['montage','-font',font,'-pointsize','18','-fill','#dddfff',...inputs.flatMap((frame,j)=>['-label',`${view} / bước ${j+1}`,join(out,`frames-${view}`,`f${String(frame).padStart(4,'0')}.png`)]),'-tile','2x4','-geometry','640x360+3+3','-background','#10141b',join(out,`${view}-hops-sheet.jpg`)]);
}

const jpg=join(owner,'thunder-codex-h.jpg'),mp4=join(owner,'thunder-codex-h.mp4');
if(existsSync(jpg)||existsSync(mp4))throw new Error('Bản h đã tồn tại; không ghi đè file cũ');
copyFileSync(join(out,'comparison-sheet.jpg'),jpg);
execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-threads','2','-framerate','60','-i',join(out,'frames-top/f%04d.png'),'-framerate','60','-i',join(out,'frames-behind/f%04d.png'),'-i',join(owner,'thunder-codex-g.mp4'),'-filter_complex','[0:v]fps=30[a];[1:v]fps=30[b];[a][b]hstack=inputs=2[v]','-map','[v]','-map','2:a:0','-t','4','-c:v','libx264','-threads','2','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',mp4]);
// Inspect decoded output before dropping the raw frames.
const frames=[];
for(const t of [.65,1.25,1.35,2.2]){
 const file=join(out,`decoded-${t.toFixed(2)}s.png`);
 execFileSync('/opt/homebrew/bin/ffmpeg',['-v','error','-ss',String(t),'-i',mp4,'-frames:v','1',file]);frames.push({t,file});
}
execFileSync(magick,['montage','-font',font,'-pointsize','24','-fill','#dddfff',...frames.flatMap(f=>['-label',`${f.t} s / Alt+1 | Alt+2`,f.file]),'-tile','1x4','-geometry','2560x720+3+3','-background','#10141b',join(out,'video-decoded-sheet.jpg')]);
const info=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-count_frames','-show_entries','stream=index,codec_name,codec_type,width,height,nb_read_frames,duration,avg_frame_rate','-of','json',mp4],{encoding:'utf8'}));
writeFileSync(join(root,'video-info.json'),JSON.stringify(info,null,2));
console.log(JSON.stringify({gates,rounds:rows,video:info},null,2));
