export default async function(page){
 await page.goto('http://localhost:3148/skills-lab.html?fixed=1&ui=0&dpr=1&q=high',{settle:1000});
 for(let k=0;k<200;k++){if(await page.eval('window.__lab?.ready&&window.__lab.lightUlt().ready'))break;await page.sleep(300);}
 return page.eval(`(()=>{const l=window.__lab;l.reset();l.step(45);l.showcase('ult-light');l.step(18);return l.lightUlt();})()`);
}
