import test from 'node:test';
import assert from 'node:assert/strict';
import createAkuma,{buildFilters,searchQuery,normalizeId,parseCatalog,parseTitle,parsePages} from '../src/sources/akuma.mjs';
import {sourceDefinitions} from '../src/definitions.mjs';
import {languageFlagData} from '../src/core/gallery_flags.mjs';

const base='https://akuma.moe',id='abc12xyz';
const titleData={csrf:'title-csrf',title:'Full [English] title',secondary:'Original title',cover:'https://s2.akuma.moe/123/0000-cover.jpg',preview:'https://s2.akuma.moe/123/tbn/0001-preview.jpg',alerts:[],
  rows:[['Category',['Doujinshi']],['Language',['english','translated']],['Artist',['Artist-name']],['Group',['Circle']],
    ['Female',['glasses']],['Male',['glasses']],['Other',['full color']],['Pages',['2']],['Date',['2026-11-02 08:45']],['Parody',['Original']],['Character',['Original character']]].map(([label,values])=>({label,values}))};
const originals=['0001-full.jpg','0002-full.webp'];
const card={href:`/g/${id}`,title:'Full [English] title',image:{src:'https://s2.akuma.moe/123/0000-cover.jpg'},flag:'flag-icon flag-icon-gb'};
const listing=(q='',cursor=null,items=[card])=>({title:'Search — akuma.moe',csrf:'catalog-csrf',alerts:[],catalog:{items},next:cursor?`${base}/?${new URLSearchParams({q,cursor})}`:null});
function fixture({baseUrl=base,request,extract}={}) {
  const calls=[],projections=[];
  const ctx={baseUrl,http:{request:async input=>{
    calls.push(input);
    if(request)return request(input,calls);
    return {url:input.url,body:new URL(input.url).pathname.startsWith('/g/')?(input.method==='POST'?JSON.stringify(originals):'title'):(input.method==='POST'?'catalog':'bootstrap')};
  }},html:{extract:async(body,query)=>{
    projections.push(query);
    if(extract)return extract(body,query);
    return body==='title'?structuredClone(titleData):body==='bootstrap'?{csrf:'seed-csrf'}:listing();
  }}};
  return {source:createAkuma(ctx),ctx,calls,projections};
}

test('Akuma is one multilingual adult source with source-owned branding, browser auth and CDN grants',()=>{
  const definitions=sourceDefinitions().filter(row=>row.id.endsWith('.akuma'));
  assert.equal(definitions.length,1);
  const source=definitions[0];
  assert.equal(source.id,'all.nsfw.akuma');assert.equal(source.language,'all');assert.equal(source.isNsfw,true);
  assert.equal(source.supportsCustomBaseUrl,true);assert.equal(source.supportsFilterRefresh,false);
  assert.equal(source.web.mangaUrlTemplate,'/g/{id}');assert.equal(source.branding.icon,'assets/source_logos/akuma.png');
  assert.equal(source.auth.loginUrl,base+'/login');assert.deepEqual(source.auth.cookieOrigins,[base]);
  assert.deepEqual(source.auth.rules,{cookieAny:['remember_web_*']});
  assert.equal(source.network.allowSubdomains,true);assert.ok(source.network.imageOrigins.includes(base));
  assert.equal(source.network.transportProfile,'host.platform.v1');assert.equal(source.network.userAgentProfile,'browser');
  assert.ok(source.network.origins.includes('https://check.ddos-guard.net'));
  assert.equal(source.network.authOrigins.includes('https://check.ddos-guard.net'),false);
  assert.deepEqual(source.network.authOrigins,[base,'https://s1.akuma.moe','https://s2.akuma.moe']);
  assert.deepEqual(source.filterBindings,{tags:'tags',artist:'artists',author:'groups'});
});

test('Akuma filters are fresh offline values, language is optional and no unsupported sort is invented',async()=>{
  const {source,calls}=fixture(),first=await source.getFilters(),expected=structuredClone(first);
  const language=first.find(row=>row.key==='language');
  assert.equal(language.kind,'singleSelect');assert.deepEqual(language.defaultValues,[]);
  assert.ok(language.options.length>=26);assert.ok(language.options.some(row=>row.value==='russian'));
  assert.equal(first.some(row=>row.kind==='sort'),false);
  assert.equal(first.find(row=>row.key==='categories').kind,'triStateMultiSelect');
  language.options.pop();assert.deepEqual(await source.getFilters(),expected);assert.equal(calls.length,0);
});

test('Akuma queries preserve namespaces, tag chips, exclusions and hyphens in artist names',()=>{
  assert.equal(searchQuery({searchTerm:' Some title ',selectedFilters:{language:['russian'],categories:['include:manga','exclude:cosplay'],tags:['glasses ♀, -glasses ♂, full color ◊, female:long hair'],artists:['Artist-name, -Other-name'],groups:['Circle'],collection:['favorited']}}),
    'Some title language:russian$ category:"manga" -category:"cosplay" female:"glasses" -male:"glasses" other:"full color" female:"long hair" group:"Circle" artist:"Artist-name" -artist:"Other-name" opt:favorited');
  assert.equal(searchQuery({selectedFilters:{tags:['-other:full color, male:glasses'],parodies:['Series'],characters:['Character']}}),'-other:"full color" male:"glasses" parody:"Series" character:"Character"');
  for(const selectedFilters of [{language:['bad']},{categories:['manga']},{categories:['include:bad']},{tags:['-']},{artists:['"\\']},{collection:['random']}])assert.throws(()=>searchQuery({selectedFilters}),{code:'parse_error'});
  assert.equal(searchQuery(), '');
});

test('Akuma opaque IDs survive mirrors and slashes without accepting reader or arbitrary paths',()=>{
  for(const raw of [id,`/g/${id}`,`https://mirror.example/g/${id}/?from=search`])assert.equal(normalizeId(raw),id);
  for(const raw of ['',null,'../x','/g/id/1','/g/a%2Fb','/g/','https://x.example/nope'])assert.throws(()=>normalizeId(raw),{code:'parse_error'});
});

test('Akuma only accepts complete thumbnail cards and a cursor belonging to this query',()=>{
  const result=parseCatalog(listing('language:russian$','next'),base,'language:russian$');
  assert.equal(result.items.length,1);assert.equal(result.items[0].languageFlagData,languageFlagData('english'));assert.equal(result.next,'next');
  assert.equal(parseCatalog(listing('',null,[card,card,{href:'/ads'}]),base,'').items.length,1);
  assert.deepEqual(parseCatalog(listing('',null,[]),base,''),{items:[],next:null});
  for(const data of [{...listing(),title:'Error'}, {...listing(),catalog:null}, listing('',null,[null]),listing('',null,[{...card,image:{}}]),listing('',null,[{...card,title:''}]),
    {...listing(),next:'https://evil.example/?cursor=x'},{...listing(),next:base+'/?q=other&cursor=x'},listing('','same'),listing('','x',[])]) {
    assert.throws(()=>parseCatalog(data,base,'','same'),{code:'parse_error'});
  }
});

test('Akuma keyword limits remain actionable errors rather than empty search results',()=>{
  assert.throws(()=>parseCatalog({...listing(),alerts:['Max keywords of 3 exceeded.']},base,''),{code:'auth_required'});
  assert.throws(()=>parseCatalog({...listing(),alerts:['Max keywords of 8 exceeded.']},base,''),{code:'parse_error'});
});

test('Akuma metadata retains the full title, namespace-specific chips, language flag and UTC upload date',()=>{
  const title=parseTitle(titleData,id,base);
  assert.equal(title.info.title,'Full [English] title');assert.equal(title.info.secondaryTitle,'Original title');
  assert.equal(title.info.author,'Circle');assert.equal(title.info.artist,'Artist-name');assert.equal(title.info.pageCount,2);
  assert.deepEqual(title.info.tags,['glasses ♀','glasses ♂','full color ◊']);assert.equal(title.uploadedAt,'2026-11-02T08:45:00.000Z');
  assert.equal(title.info.languageFlagData,languageFlagData('english'));assert.equal(title.info.type,'Doujinshi');
  assert.match(title.info.description,/Original character/u);
  assert.throws(()=>parseTitle({...titleData,title:''},id,base),{code:'parse_error'});
  assert.throws(()=>parseTitle({...titleData,rows:[null]},id,base),{code:'parse_error'});
});

test('Akuma full images use the bulk original filenames, never preview filenames or a partial list',()=>{
  const title=parseTitle(titleData,id,base);
  assert.deepEqual(parsePages(originals,title),[{index:0,imageUrl:'https://s2.akuma.moe/123/0001-full.jpg'},{index:1,imageUrl:'https://s2.akuma.moe/123/0002-full.webp'}]);
  for(const files of [[],originals.slice(0,1),[originals[0],originals[0]],['../image.jpg',originals[1]],['https://evil.example/image.jpg',originals[1]],['x.jpg?q=1',originals[1]]])assert.throws(()=>parsePages(files,title),{code:'parse_error'});
  assert.throws(()=>parsePages(originals,{...title,preview:title.info.coverUrl}),{code:'parse_error'});
});

test('Akuma concurrent feed widgets share bootstrap and thumbnail POST; an explicit refresh makes a new request',async()=>{
  const {source,calls}=fixture();
  const [popular,latest]=await Promise.all([source.getPopular(),source.getLatest()]);
  assert.deepEqual(popular,latest);assert.equal(calls.length,2);
  assert.equal(calls[0].method,'GET');assert.equal(calls[0].url,base+'/?q=');
  assert.equal(calls[1].method,'POST');assert.equal(new URLSearchParams(calls[1].body).get('view'),'3');
  assert.equal(new URLSearchParams(calls[1].body).get('_token'),'seed-csrf');
  await source.getPopular();assert.equal(calls.length,3);assert.equal(new URLSearchParams(calls[2].body).get('view'),'3');
  assert.equal(calls[2].headers['X-Requested-With'],'XMLHttpRequest');
});

test('Akuma details, chapters and complete pages share one title GET and one bulk POST',async()=>{
  const {source,calls}=fixture();
  const [details,chapters,pages]=await Promise.all([source.getDetails({mangaId:id}),source.getChapters({mangaId:id}),source.getPages({mangaId:id,chapterId:id})]);
  assert.equal(details.id,id);assert.equal(chapters.length,1);assert.equal(chapters[0].id,id);assert.equal(chapters[0].uploadedAt,'2026-11-02T08:45:00.000Z');
  assert.equal(pages.length,2);assert.equal(calls.length,2);assert.ok(calls.every(call=>call.url===`${base}/g/${id}`));
  assert.equal(new URLSearchParams(calls[1].body).get('_token'),'title-csrf');
  assert.equal(new URLSearchParams(calls[1].body).has('view'),false);
  await source.getPages({mangaId:id,chapterId:id});assert.equal(calls.length,2);
  await assert.rejects(source.getPages({mangaId:'other',chapterId:id}),{code:'parse_error'});
});

test('Akuma failed title or full-image loads are retryable and cannot cache incomplete data',async()=>{
  let invalidTitle=true,invalidPages=true;
  const {source,calls}=fixture({request:async input=>({url:input.url,body:input.method==='POST'?JSON.stringify(invalidPages?originals.slice(0,1):originals):'title'}),extract:async()=>invalidTitle?{...titleData,title:''}:titleData});
  await assert.rejects(source.getDetails({mangaId:id}),{code:'parse_error'});invalidTitle=false;
  await assert.rejects(source.getPages({mangaId:id,chapterId:id}),{code:'parse_error'});invalidPages=false;
  assert.equal((await source.getPages({mangaId:id,chapterId:id})).length,2);
  assert.equal(calls.filter(call=>call.method==='GET').length,2);
});

test('Akuma expires a rejected CSRF token once and retries only HTTP 419',async()=>{
  for(const status of [419,403,429,504]) {
    let posts=0,seeds=0;
    const {source,calls}=fixture({request:async input=>{
      if(input.method==='GET')return {url:input.url,body:`seed-${++seeds}`};
      if(++posts===1)throw Object.assign(Error('server'),{code:status===429?'rate_limited':'invalid_response',httpStatus:status});
      return {url:input.url,body:'catalog'};
    },extract:async body=>body.startsWith('seed-')?{csrf:body}:listing()});
    if(status===419){assert.equal((await source.getPopular()).length,1);assert.equal(posts,2);assert.equal(seeds,2);assert.equal(new URLSearchParams(calls.at(-1).body).get('_token'),'seed-2');}
    else {await assert.rejects(source.getPopular(),error=>error.httpStatus===status);assert.equal(posts,1);assert.equal(seeds,1);}
  }
});

test('Akuma browser challenges stay typed even when served with HTTP 200',async()=>{
  for(const response of [{body:'<title>DDoS-Guard</title>'},{body:'<title>Just a moment...</title>'}]) {
    const {source}=fixture({request:async()=>response,extract:async()=>assert.fail('Must not parse a challenge')});
    await assert.rejects(source.getPopular(),{code:'challenge_required'});
  }
  const {source}=fixture({request:async()=>{throw Object.assign(Error('denied'),{code:'access_denied',httpStatus:403,body:'<title>DDoS-Guard</title>'});}});
  await assert.rejects(source.getPopular(),{code:'challenge_required'});
});

test('Akuma renews an expired guard cookie and retries the same thumbnail page',async()=>{
  for(const status of [200,403]) {
    let guarded=false,renewed=false;
    const guardBody='<title>DDoS-Guard</title>';
    const {source,calls}=fixture({request:async input=>{
      if(input.url==='https://check.ddos-guard.net/check.js')return {body:"new Image().src='/.well-known/ddos-guard/check';"};
      if(new URL(input.url).pathname==='/.well-known/ddos-guard/check'){renewed=true;return {status:204,body:''};}
      if(input.method==='GET')return {body:'seed'};
      if(new URL(input.url).searchParams.has('cursor')&&!renewed){
        guarded=true;
        if(status===403)throw Object.assign(Error('denied'),{httpStatus:403,body:guardBody});
        return {status:200,body:guardBody};
      }
      const next=renewed?(new URL(input.url).searchParams.get('cursor')==='after-renewal'?null:'after-renewal'):'saved-boundary';
      return {body:JSON.stringify(listing('',next))};
    },extract:async body=>body==='seed'?{csrf:'seed-csrf'}:JSON.parse(body)});
    await source.getPopular();
    assert.equal((await source.getPopular({page:2})).length,1);
    assert.equal(guarded,true);assert.equal(renewed,true);
    const posts=calls.filter(call=>call.method==='POST');
    assert.equal(posts.length,3);
    assert.equal(posts[1].url,posts[2].url);assert.equal(posts[1].body,posts[2].body);
    assert.equal(new URL(posts[2].url).searchParams.get('cursor'),'saved-boundary');
    assert.equal(new URLSearchParams(posts[2].body).get('view'),'3');
    await source.getPopular({page:3});
    assert.equal(new URL(calls.at(-1).url).searchParams.get('cursor'),'after-renewal');
  }
});

test('Akuma concurrent guard failures share one renewal and preserve both searches',async()=>{
  let renewed=false;
  const {source,calls}=fixture({request:async input=>{
    if(input.url==='https://check.ddos-guard.net/check.js')return {body:"new Image().src='/.well-known/ddos-guard/check';"};
    if(new URL(input.url).pathname==='/.well-known/ddos-guard/check'){renewed=true;return {status:204,body:''};}
    if(input.method==='GET')return {body:'seed'};
    if(!renewed)throw Object.assign(Error('guard'),{httpStatus:403,body:'<title>DDoS-Guard</title>'});
    return {body:'catalog'};
  },extract:async body=>body==='seed'?{csrf:'seed-csrf'}:listing()});
  const results=await Promise.all([source.getPopular(),source.search({selectedFilters:{language:['russian']}})]);
  assert.ok(results.every(items=>items.length===1));
  assert.equal(calls.filter(call=>call.url==='https://check.ddos-guard.net/check.js').length,1);
  assert.equal(calls.filter(call=>new URL(call.url).pathname==='/.well-known/ddos-guard/check').length,1);
  assert.ok(calls.every(call=>!Object.keys(call.headers).some(key=>key.toLowerCase()==='cookie')));
});

test('Akuma renews CSRF after guard recovery without losing the filtered page cursor',async()=>{
  let renewed=false;
  const q='language:russian$';
  const {source,calls}=fixture({request:async input=>{
    if(input.url==='https://check.ddos-guard.net/check.js')return {body:"new Image().src='/.well-known/ddos-guard/check';"};
    if(new URL(input.url).pathname==='/.well-known/ddos-guard/check'){renewed=true;return {body:''};}
    if(input.method==='GET')return {body:renewed?'new-seed':'old-seed'};
    if(new URL(input.url).searchParams.has('cursor')){
      if(!renewed)throw Object.assign(Error('guard'),{httpStatus:403,body:'<title>DDoS-Guard</title>'});
      if(new URLSearchParams(input.body).get('_token')!=='new-seed')throw Object.assign(Error('CSRF'),{httpStatus:419});
    }
    return {body:JSON.stringify({...listing(q,new URL(input.url).searchParams.has('cursor')?null:'saved-boundary'),csrf:renewed?'new-seed':'old-seed'})};
  },extract:async body=>body.endsWith('-seed')?{csrf:body}:JSON.parse(body)});
  const selectedFilters={language:['russian']};
  await source.search({selectedFilters});
  assert.equal((await source.search({selectedFilters,page:2})).length,1);
  const posts=calls.filter(call=>call.method==='POST');
  assert.equal(posts.length,4);
  assert.ok(posts.slice(1).every(call=>new URL(call.url).searchParams.get('q')===q&&new URL(call.url).searchParams.get('cursor')==='saved-boundary'));
  assert.equal(new URLSearchParams(posts.at(-1).body).get('_token'),'new-seed');
});

test('Akuma a late guard response reuses the cookie already renewed by another request',async()=>{
  let renewed=false,rejectTitle,startedTitle;
  const titleStarted=new Promise(resolve=>{startedTitle=resolve;});
  const guardError=()=>Object.assign(Error('guard'),{httpStatus:403,body:'<title>DDoS-Guard</title>'});
  const {source,calls}=fixture({request:async input=>{
    if(input.url==='https://check.ddos-guard.net/check.js')return {body:"new Image().src='/.well-known/ddos-guard/check';"};
    if(new URL(input.url).pathname==='/.well-known/ddos-guard/check'){renewed=true;return {body:''};}
    if(new URL(input.url).pathname.startsWith('/g/')){
      if(renewed)return {body:'title'};
      return new Promise((resolve,reject)=>{rejectTitle=reject;startedTitle();});
    }
    if(input.method==='GET')return {body:'bootstrap'};
    if(!renewed)throw guardError();
    return {body:'catalog'};
  }});
  const title=source.getDetails({mangaId:id});
  await titleStarted;
  await source.getPopular();
  rejectTitle(guardError());
  assert.equal((await title).id,id);
  assert.equal(calls.filter(call=>call.url==='https://check.ddos-guard.net/check.js').length,1);
});

test('Akuma bounds guard recovery and never executes or follows arbitrary script URLs',async()=>{
  for(const body of ["location.href='https://untrusted.example/x';", "new Image().src='/.well-known/ddos-guard/../../../login';",'<title>DDoS-Guard</title>']) {
    const {source,calls}=fixture({request:async input=>{
      if(input.url==='https://check.ddos-guard.net/check.js')return {body};
      throw Object.assign(Error('guard'),{httpStatus:403,body:'<title>DDoS-Guard</title>'});
    }});
    await assert.rejects(source.getPopular(),{code:'challenge_required'});
    assert.equal(calls.length,2);
  }
  const {source,calls}=fixture({request:async input=>{
    if(input.url==='https://check.ddos-guard.net/check.js')return {body:"new Image().src='/.well-known/ddos-guard/check';"};
    if(new URL(input.url).pathname==='/.well-known/ddos-guard/check')return {body:''};
    throw Object.assign(Error('guard'),{httpStatus:403,body:'<title>DDoS-Guard</title>'});
  }});
  await assert.rejects(source.getPopular(),{code:'challenge_required'});
  assert.equal(calls.length,4);
});

test('Akuma a failed guard renewal does not poison the next attempt',async()=>{
  let fail=true,renewed=false;
  const {source,calls}=fixture({request:async input=>{
    if(input.url==='https://check.ddos-guard.net/check.js'){
      if(fail)throw Object.assign(Error('network'),{code:'network'});
      return {body:"new Image().src='/.well-known/ddos-guard/check';"};
    }
    if(new URL(input.url).pathname==='/.well-known/ddos-guard/check'){renewed=true;return {body:''};}
    if(!renewed)throw Object.assign(Error('guard'),{httpStatus:403,body:'<title>DDoS-Guard</title>'});
    return {body:input.method==='GET'?'seed':'catalog'};
  },extract:async body=>body==='seed'?{csrf:'seed-csrf'}:listing()});
  await assert.rejects(source.getPopular(),{code:'network'});fail=false;
  assert.equal((await source.getPopular()).length,1);
  assert.equal(calls.filter(call=>call.url==='https://check.ddos-guard.net/check.js').length,2);
});

test('Akuma cursor pages are isolated by the full query and a later page reuses its known cursor',async()=>{
  const requests=[],{source}=fixture({request:async input=>{
    if(input.method==='GET')return {url:input.url,body:'seed'};
    const url=new URL(input.url),q=url.searchParams.get('q'),cursor=url.searchParams.get('cursor');
    requests.push({q,cursor});
    return {url:input.url,body:JSON.stringify(listing(q,cursor?'':q+'-next'))};
  },extract:async body=>body==='seed'?{csrf:'seed-csrf'}:JSON.parse(body)});
  await Promise.all([source.search({selectedFilters:{language:['english']}}),source.search({selectedFilters:{language:['russian']}})]);
  await Promise.all([source.search({page:2,selectedFilters:{language:['english']}}),source.search({page:2,selectedFilters:{language:['russian']}})]);
  assert.deepEqual(requests.map(row=>row.cursor),[null,null,'language:english$-next','language:russian$-next']);
  assert.deepEqual(await source.search({page:3,selectedFilters:{language:['english']}}),[]);assert.equal(requests.length,4);
  await source.search({selectedFilters:{language:['english']}});assert.equal(requests.length,5);
});

test('Akuma can restore a later page by walking opaque cursors with bounded work',async()=>{
  let requests=0;
  const {source}=fixture({request:async input=>({url:input.url,body:input.method==='GET'?'seed':JSON.stringify(listing('',String(++requests)))}),extract:async body=>body==='seed'?{csrf:'seed'}:JSON.parse(body)});
  assert.equal((await source.search({page:3})).length,1);assert.equal(requests,3);
  await source.search({page:4});assert.equal(requests,4);
  await assert.rejects(source.search({page:1000}),{code:'resource_limit'});assert.equal(requests,4);
});

test('Akuma retains the original pagination boundary while reading a chapter for a long time',async()=>{
  const requests=[];
  const {source}=fixture({request:async input=>{
    if(input.method==='GET')return {url:input.url,body:'seed'};
    const url=new URL(input.url);requests.push(url.searchParams.get('cursor'));
    return {url:input.url,body:JSON.stringify(listing('',requests.length===1?'original-boundary':null))};
  },extract:async body=>body==='seed'?{csrf:'seed'}:JSON.parse(body)});
  await source.getPopular();
  const clock=Date.now;
  Date.now=()=>clock()+30*60*1000;
  try {await source.getPopular({page:2});} finally {Date.now=clock;}
  assert.deepEqual(requests,[null,'original-boundary']);
});

test('Akuma refreshing another feed never discards an existing catalog cursor',async()=>{
  const posts=[];
  const {source}=fixture({request:async input=>{
    if(input.method==='GET')return {body:'seed'};
    const cursor=new URL(input.url).searchParams.get('cursor');
    posts.push(cursor);
    return {body:JSON.stringify(listing('',cursor?`${cursor}-next`:`boundary-${posts.length}`))};
  },extract:async body=>body==='seed'?{csrf:'seed-csrf'}:JSON.parse(body)});
  await source.getPopular();
  await source.getPopular({page:2});
  await source.getLatest();
  await source.search();
  await source.getPopular({page:3});
  assert.deepEqual(posts,[null,'boundary-1',null,null,'boundary-1-next']);
});

test('Akuma settings/session instances never share CSRF or image caches and honor the chosen base URL',async()=>{
  const first=fixture(),second=fixture({baseUrl:'https://mirror.example'});
  await Promise.all([first.source.getPopular(),second.source.getPopular()]);
  assert.equal(first.calls.length,2);assert.equal(second.calls.length,2);
  assert.ok(second.calls.every(call=>new URL(call.url).origin==='https://mirror.example'&&call.headers.Referer==='https://mirror.example/'));
  await second.source.getDetails({mangaId:id});await second.source.getPages({mangaId:id,chapterId:id});
  assert.ok(second.calls.every(call=>new URL(call.url).origin==='https://mirror.example'));
});
