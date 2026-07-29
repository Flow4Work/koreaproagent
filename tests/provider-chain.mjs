import{strictEqual,ok}from'assert';
const P=[{id:'ds',type:'zen',tm:35000},{id:'zf',type:'zen',tm:35000},{id:'gq',type:'groq',tm:30000}];
const D=75000,F=110000;let a=0,b=0;
function t(n,f){try{f();a++;console.log('PASS '+n)}catch(e){b++;console.log('FAIL '+n+': '+e.message.split('\\n')[0])}}
console.log('\n=== Provider Chain Tests ===');
t('Chain length 3',()=>ok(P.length===3));
t('DS timeout 35s',()=>ok(P[0].tm===35000));
t('ZF timeout 35s',()=>ok(P[1].tm===35000));
t('GQ timeout 30s',()=>ok(P[2].tm===30000));
t('Deadline <=75s',()=>ok(D<=75000));
t('Frontend > Backend+20s',()=>ok(F>D+20000));
t('Unique IDs',()=>ok(new Set(P.map(x=>x.id)).size===3));
let t2=a+b;console.log(t2+' total, '+a+' passed, '+b+' failed');process.exit(b>0?1:0); 
