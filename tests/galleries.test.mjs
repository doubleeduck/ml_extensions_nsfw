import test from 'node:test';import assert from 'node:assert/strict';
import createThree,{catalogUrl as threeUrl,pages as threePages,selectListing} from '../src/sources/threehentai.mjs';
import createNh,{catalogUrl as nhUrl,details as nhDetails,pages as nhPages,galleryData,buildFilters as nhFilters,parseLanguageOptions} from '../src/sources/nhentaito.mjs';
import {classFlagData,tagFlagData,languageFlagData} from '../src/core/gallery_flags.mjs';
import {sourceDefinitions} from '../src/definitions.mjs';
import {galleryFilters,listing,numericId} from '../src/core/gallery.mjs';

const threeBase='https://3hentai.net',nhBase='https://nhentai.to';
const row={href:'/g/7/',title:'Название',image:{lazy:'https://supercdn.site/galleries/99/thumb.jpg',src:'data:image/gif;base64,x'}};
const gallery={id:3,media_id:'99',title:{english:'Название',japanese:'Original'},images:{pages:{2:{t:'j'},3:{t:'w'}}},tags:[{type:'language',name:'english'},{type:'tag',name:'Full color'},{type:'artist',name:'Writer'}],num_pages:2};
const nhScript=value=>`N.init({});var gallery = new N.gallery(${JSON.stringify(value).slice(0,-1)},}); throw new Error('must not execute');`;
const nhTitle={cover:{src:'https://supercdn.site/galleries/99/cover.jpg'},scripts:[nhScript(gallery)],related:[row,{...row,href:'/g/8/',title:'Другое'}]};
const threeTitle={title:'Название',cover:{lazy:'https://s1.3hentai.net/d99/cover.jpg'},links:[{href:'/language/english',text:'English'},{href:'/tags/full-color',text:'Full color'}],rows:[],count:[{},{}],related:[]};
const threeReader={baseUri:'https://3hentai.net/d/7/%s',baseUriImg:'https://s1.3hentai.net/d99/%s',lastPage:2,pages:{1:{f:'1.jpg'},2:{f:'2.webp'}}};
const readerScript=value=>`var readerPages=JSON.parse(atob("${Buffer.from(JSON.stringify(value)).toString('base64')}"));`;
function fixture(kind,{fail=false}={}) {
 const calls=[],queries=[];let failed=false;
 const create=kind==='three'?createThree:createNh,baseUrl=kind==='three'?threeBase:nhBase;
 const source=create({baseUrl,http:{request:async input=>{calls.push(input);if(fail&&!failed){failed=true;throw Object.assign(Error('offline'),{code:'offline'});}return {body:input.url.includes('/7/1')?'reader':input.url.includes('/7')?'title':'catalog',url:input.url};}},html:{extract:async(body,query)=>{
  queries.push(query);return body==='reader'?[readerScript(threeReader)]:body==='title'?kind==='three'?threeTitle:nhTitle:[{...row,href:kind==='three'?'/d/7':'/g/7/'}];
 }}});return {source,calls,queries};
}

test('both multilingual sources have exactly one all-language registration, packaged icons and proper CDN grants',()=>{
 const definitions=sourceDefinitions();for(const key of ['threehentai','nhentaito']){const matches=definitions.filter(d=>d.id.endsWith('.'+key));assert.equal(matches.length,1);const d=matches[0];assert.equal(d.language,'all');assert.equal(d.isNsfw,true);assert.ok(d.features.auth&&d.features.recommendations&&d.supportsCustomBaseUrl);assert.equal(d.network.transportProfile,'host.platform.v1');assert.equal(d.branding.icon,`assets/source_logos/${key}.png`);}
 for(const host of ['supercdn.site','t.nhentai.net','i.nhentai.net'])assert.ok(definitions.find(d=>d.id==='all.nsfw.nhentaito').network.imageOrigins.includes('https://'+host));
 assert.ok(definitions.find(d=>d.id==='all.nsfw.threehentai').auth.cookieOrigins.includes('https://ru.3hentai.net'));
 const nh=definitions.find(d=>d.id==='all.nsfw.nhentaito');
 assert.equal(nh.baseUrl,'https://nhentai.net');assert.equal(nh.network.userAgentProfile,'browser');
 assert.ok(nh.network.imageOrigins.includes('https://nhentai.net'));
 assert.equal(nh.auth.loginUrl,'https://nhentai.net/login');
 assert.equal(nh.supportsFilterRefresh,true);
});
test('gallery language filtering is optional and single-select; sorting never exposes a false direction',()=>{
 const filters=galleryFilters([['latest','Последние']]);assert.equal(filters.find(f=>f.key==='language').kind,'singleSelect');assert.deepEqual(filters.find(f=>f.key==='language').defaultValues,[]);assert.equal(filters.find(f=>f.key==='sort').supportsDirection,false);assert.ok(filters.find(f=>f.key==='language').options.some(o=>o.value==='russian'));
});
test('gallery IDs are stable numeric IDs independent of slugs, mirrors and embedded legacy IDs',()=>{
 assert.equal(numericId('https://mirror.example/g/7/','g'),'7');assert.equal(numericId('/d/7','d'),'7');for(const id of ['../7','0','/g/7/1','/d/7'])assert.throws(()=>numericId(id,'g'),e=>e.code==='parse_error');
 assert.equal(nhDetails(nhTitle,'7',nhBase).info.id,'7');
});
test('listing keeps real lazy covers, language-neutral IDs and removes repeated/ad cards',()=>{
 const result=listing([row,row,{href:'/out/ad',title:'Ad'}],nhBase,'g');assert.equal(result.length,1);assert.equal(result[0].id,'7');assert.equal(result[0].coverUrl,row.image.lazy);
});
test('3Hentai combines language, quoted taxonomy exclusions, title search, sorting and pagination',()=>{
 const u=new URL(threeUrl(threeBase,{searchTerm:'Some title',page:2,selectedFilters:{language:['english'],tags:['full color, -other'],sort:['popular']}}));assert.equal(u.pathname,'/search');assert.equal(u.searchParams.get('q'),'Some title lang:english tag:"full color" -tag:"other"');assert.equal(u.searchParams.get('sort'),'popular');assert.equal(u.searchParams.get('page'),'2');
 const popular=new URL(threeUrl(threeBase,{page:2},'popular'));assert.equal(popular.pathname,'/search');assert.equal(popular.searchParams.get('q'),'pages:>0');assert.equal(popular.searchParams.get('sort'),'popular');assert.equal(popular.searchParams.get('page'),'2');
 const sorted=new URL(threeUrl(threeBase,{selectedFilters:{sort:['popular']}}));assert.equal(sorted.searchParams.get('q'),'pages:>0');
 const taxonomy=new URL(threeUrl(threeBase,{selectedFilters:{artists:['Artist'],parodies:['Series']}}));assert.equal(taxonomy.searchParams.get('q'),'user:"Artist" serie:"Series"');
 assert.equal(new URL(threeUrl(threeBase,{page:2},'latest')).pathname,'/2');
});
test('3Hentai reads the full base64 reader map with original mixed formats and validates every page',()=>{
 assert.deepEqual(threePages([readerScript(threeReader)],'7').map(p=>p.imageUrl),['https://s1.3hentai.net/d99/1.jpg','https://s1.3hentai.net/d99/2.webp']);
 for(const value of [{...threeReader,lastPage:3},{...threeReader,baseUri:'https://3hentai.net/d/8/%s'},{...threeReader,baseUriImg:'https://other.example/%s'},{...threeReader,pages:{1:{f:'1t.jpg'},2:{f:'2.webp'}}}])assert.throws(()=>threePages([readerScript(value)],'7'),e=>e.code==='parse_error');
 assert.throws(()=>threePages(['var readerPages=evil()'],'7'),e=>e.code==='parse_error');
 assert.equal(threePages([readerScript({...threeReader,baseUriImg:'https://mirror.example/media/%s'})],'7','https://mirror.example')[0].imageUrl,'https://mirror.example/media/1.jpg');
});
test('3Hentai reads the full catalog group for popular searches and excludes the homepage teaser',()=>{
 const groups=[{class:'listing-container container-xl text-center',items:[{id:'popular'}]},{class:'listing-container container-xl',items:[{id:'latest'}]}];
 for(const mode of ['latest','popular','search'])assert.deepEqual(selectListing(groups,mode).map(row=>row.id),['latest']);
 assert.deepEqual(selectListing([{class:'listing-container bg-container container-xl',items:[{id:'filtered'}]}],'search',{selectedFilters:{sort:['popular'],language:['english']}}).map(row=>row.id),['filtered']);
});
test('nhentai uses the full catalog and composable namespace filters on the chosen host',()=>{
 for(const base of [nhBase,'https://nhentai.net','https://mirror.example']) {
  const language=new URL(nhUrl(base,{page:2,selectedFilters:{language:['russian']}}));
  assert.equal(language.origin,base);assert.equal(language.pathname,'/search');assert.equal(language.searchParams.get('q'),'language:russian');assert.equal(language.searchParams.get('page'),'2');
  assert.equal(new URL(nhUrl(base,{selectedFilters:{tags:['full color']}})).searchParams.get('q'),'tag:"full color"');
  assert.equal(new URL(nhUrl(base,{},'latest')).pathname,'/');
  assert.equal(new URL(nhUrl(base,{page:2},'latest')).searchParams.get('page'),'2');
  const popular=new URL(nhUrl(base,{page:2},'popular'));assert.equal(popular.pathname,'/search');assert.equal(popular.searchParams.get('q'),'pages:>0');assert.equal(popular.searchParams.get('sort'),'popular');assert.equal(popular.searchParams.get('page'),'2');
 }
 const combined=new URL(nhUrl(nhBase,{searchTerm:'Title',selectedFilters:{language:['english'],tags:['full color, -other'],artists:['An Artist'],groups:['Group'],category:['manga']}}));
 assert.equal(combined.searchParams.get('q'),'Title language:english category:"manga" tag:"full color" -tag:"other" artist:"An Artist" group:"Group"');
});

test('nhentai combines title, language, page range and exclusions with real sort and pagination parameters',()=>{
 const url=new URL(nhUrl(nhBase,{searchTerm:'Full color',page:2,selectedFilters:{language:['english'],sort:['popular'],min_pages:['20'],max_pages:['40'],exclude:['western, other']}}));
 assert.equal(url.pathname,'/search');assert.deepEqual(Object.fromEntries(url.searchParams),{q:'Full color language:english pages:>=20 pages:<=40 -tag:"western" -tag:"other"',page:'2',sort:'popular'});
 for(const [value,expected] of [['latest','date'],['popular-today','popular-today'],['popular-week','popular-week'],['popular-month','popular-month'],['most-liked','popular'],['relevance','date']])assert.equal(new URL(nhUrl(nhBase,{searchTerm:'Title',selectedFilters:{sort:[value]}})).searchParams.get('sort'),expected);
 for(const selectedFilters of [{min_pages:['-1']},{min_pages:['bad']},{min_pages:['40'],max_pages:['20']}])assert.throws(()=>nhUrl(nhBase,{searchTerm:'Title',selectedFilters}),e=>e.code==='parse_error');
 assert.ok(nhFilters().find(row=>row.key==='exclude'));assert.equal(nhFilters().find(row=>row.key==='sort').supportsDirection,false);
 assert.equal(new URL(nhUrl(nhBase,{selectedFilters:{language:['russian'],tags:['full color'],exclude:['other']}})).searchParams.get('q'),'language:russian tag:"full color" -tag:"other"');
 for(const selectedFilters of [{sort:['unknown']},{language:['bad:query']},{tags:['-']},{tags:['"\\']},{exclude:['"']}])assert.throws(()=>nhUrl(nhBase,{selectedFilters}),{code:'parse_error'});
 assert.ok(nhFilters().every(row=>!row.caption?.includes('Одна точная рубрика')));
});

const language=(slug,count=1)=>({type:'language',slug,name:slug,count});
const languageResponse=(result,numPages=1)=>({cached:[{url:'/api/v2/tags/language?sort=popular&page=1',data:JSON.stringify({status:200,body:JSON.stringify({result,num_pages:numPages})})}]});
test('nhentai languages come from the actual taxonomy, coalesce and refresh per source instance',async()=>{
 let response=languageResponse([language('english'),language('ukrainian',6),language('russian',0),language('english'),language('bad:query'),{type:'tag',name:'other',slug:'other',count:1}]);
 const calls=[],ctx={baseUrl:'https://nhentai.net',http:{request:async input=>(calls.push(input),{body:'HTML',url:input.url})},html:{extract:async()=>response}},source=createNh(ctx);
 const [first,paired]=await Promise.all([source.getFilters(),source.getFilters()]);
 const options=first.find(row=>row.key==='language').options;
 assert.deepEqual(options.map(row=>[row.value,row.label]),[['english','Английский'],['ukrainian','Украинский']]);
 assert.deepEqual(paired,first);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://nhentai.net/languages?sort=popular');
 await source.getFilters();assert.equal(calls.length,1);
 response=languageResponse([language('japanese')]);
 const updated=await source.getFilters({refresh:true});assert.deepEqual(updated.find(row=>row.key==='language').options.map(row=>row.value),['japanese']);assert.equal(calls.length,2);
 await createNh(ctx).getFilters();assert.equal(calls.length,3);
 assert.equal(new URL(nhUrl(ctx.baseUrl,{selectedFilters:{language:['ukrainian'],tags:['full color']}})).searchParams.get('q'),'language:ukrainian tag:"full color"');
});

test('nhentai language pagination is bounded, deduplicated and failed reads remain retryable',async()=>{
 const calls=[],source=createNh({baseUrl:'https://nhentai.net',http:{request:async input=>(calls.push(input),{body:input.url.includes('page=2')?'second':'first',url:input.url})},html:{extract:async body=>languageResponse(body==='first'?[language('english')]:[language('english'),language('chinese')],2)}});
 const filters=await source.getFilters();assert.deepEqual(filters.find(row=>row.key==='language').options.map(row=>row.value),['english','chinese']);assert.equal(calls.length,2);assert.equal(new URL(calls[1].url).searchParams.get('page'),'2');
 let attempt=0;
 const retry=createNh({baseUrl:'https://nhentai.net',http:{request:async input=>({body:'HTML',url:input.url})},html:{extract:async()=>languageResponse(++attempt===1?[]:[language('english')])}});
 await assert.rejects(retry.getFilters(),{code:'parse_error'});assert.ok((await retry.getFilters()).length);assert.equal(attempt,2);
 assert.throws(()=>parseLanguageOptions(languageResponse([language('english')],9),'https://nhentai.net'),{code:'parse_error'});
});

test('gallery flags come from exact class/tag tokens and small packaged PNG data',()=>{
 for(const [classes,language] of [['doujin flag flag-rus','russian'],['flag-en','english'],['flag-jpn','japanese'],['gallery lang-gb svelte-test','english'],['lang-jp','japanese'],['lang-cn','chinese'],['lang-ru','russian']])assert.equal(classFlagData(classes),languageFlagData(language));
 assert.equal(tagFlagData('22 19 17'),languageFlagData('english'));assert.equal(tagFlagData('2 17'),languageFlagData('japanese'));assert.equal(tagFlagData('10197'),languageFlagData('chinese'));
 assert.equal(tagFlagData('119 200'),null);assert.equal(classFlagData('flag-unknown'),null);
 assert.equal(tagFlagData('2 19'),languageFlagData('english'));assert.equal(tagFlagData('85195 17'),languageFlagData('russian'));assert.equal(tagFlagData('84916'),languageFlagData('korean'));
 for(const language of ['english','japanese','chinese','russian','korean','spanish','french','italian','portuguese']){const uri=languageFlagData(language);assert.match(uri,/^data:image\/png;base64,/u);const bytes=Buffer.from(uri.split(',')[1],'base64');assert.ok(bytes.length<=4096);assert.equal(bytes.readUInt32BE(16),100);assert.equal(bytes.readUInt32BE(20),67);}
 const rows=listing(selectListing([{class:'listing-container',items:[{...row,href:'/d/7',class:'doujin flag flag-rus'}]}]),threeBase,'d');assert.equal(rows[0].languageFlagData,languageFlagData('russian'));
 assert.equal(nhDetails(nhTitle,'7',nhBase).info.languageFlagData,languageFlagData('english'));
});
test('nhentai.to data parser tolerates the site trailing comma but never executes constructors or trailing JavaScript',()=>{
 assert.deepEqual(galleryData([nhScript(gallery)]),gallery);
 for(const script of ['new N.gallery({secret:call()})','new N.gallery({"a":[})','new N.gallery({"a":1'])assert.throws(()=>galleryData([script]),e=>e.code==='parse_error');
 const nested={...gallery,title:{english:'A } \\" [ title'}};assert.deepEqual(galleryData([nhScript(nested)]),nested);
});
test('nhentai.to pages use descriptor order instead of shifted PHP array keys and never use thumbnails',()=>{
 const data=nhDetails(nhTitle,'7',nhBase);assert.equal(data.info.pageCount,2);assert.equal(data.info.artist,'Writer');assert.deepEqual(data.info.tags,['Full color']);assert.deepEqual(data.related.map(i=>i.id),['8']);
 assert.equal(data.info.coverUrl,'https://t.nhentai.net/galleries/99/cover.jpg');
 assert.equal(data.related[0].coverUrl,'https://t.nhentai.net/galleries/99/thumb.jpg');
 assert.deepEqual(nhPages(data).map(p=>p.imageUrl),['https://i.nhentai.net/galleries/99/1.jpg','https://i.nhentai.net/galleries/99/2.webp']);
 assert.throws(()=>nhPages({...data,info:{...data.info,pageCount:3}}),e=>e.code==='parse_error');assert.throws(()=>nhPages({...data,gallery:{...gallery,images:{pages:[{t:'unknown'},{t:'w'}]}}}),e=>e.code==='parse_error');
});

test('nhentai.to catalog resolves original CDN covers without extra image requests',async()=>{
 const {source,calls}=fixture('nh');
 for(const read of [()=>source.getPopular(),()=>source.getLatest(),()=>source.search({searchTerm:'demo'})]){
  const before=calls.length,items=await read();assert.equal(calls.length,before+1);
  assert.equal(items[0].coverUrl,'https://t.nhentai.net/galleries/99/thumb.jpg');
 }
});

test('nhentai.to preserves independent mirror media and all full-page descriptor formats',()=>{
 const formats=['j','p','g','w','a'],data=nhDetails({...nhTitle,cover:{src:'https://mirror.example/galleries/99/cover.png'},
  scripts:[nhScript({...gallery,num_pages:formats.length,images:{pages:formats.map(t=>({t}))}})]},'7','https://mirror.example');
 assert.equal(data.info.coverUrl,'https://mirror.example/galleries/99/cover.png');
 assert.deepEqual(nhPages(data).map(p=>p.imageUrl),['jpg','png','gif','webp','avif'].map((ext,i)=>`https://mirror.example/galleries/99/${i+1}.${ext}`));
 for(const cover of [{src:'https://supercdn.site/unrelated/cover.jpg'},{src:'https://supercdn.site.evil.example/galleries/99/cover.jpg'}]){
  assert.equal(nhDetails({...nhTitle,cover},'7',nhBase).info.coverUrl,cover.src);
 }
});

const modernGallery={...gallery,id:7,images:undefined,pages:[{number:1,path:'galleries/99/1.webp',width:1000,height:1400},{number:2,path:'galleries/99/2.jpg.webp',width:1000,height:1400}]};
const cachedTitle=(value=modernGallery,url='/api/v2/galleries/7?include=related%2Ccomments')=>({
 cover:{src:'https://t3.nhentai.net/galleries/99/cover.webp'},scripts:['window.galleryNotExecuted = true;'],
 cached:[{url,data:JSON.stringify({status:200,body:JSON.stringify(value)})}],
 related:[{...row,href:'/g/8/',class:'gallery lang-gb',image:{src:'https://t4.nhentai.net/galleries/88/thumb.webp'}}],
});

test('nhentai parses the new server-rendered JSON without executing Svelte or making a private API request',async()=>{
 const calls=[],source=createNh({baseUrl:'https://nhentai.net',http:{request:async input=>(calls.push(input),{body:'server HTML',url:input.url})},html:{extract:async()=>cachedTitle()}});
 const [info,chapters,pageList,recommendations]=await Promise.all([
  source.getDetails({mangaId:'7'}),source.getChapters({mangaId:'7'}),source.getPages({mangaId:'7',chapterId:'7'}),source.getRecommendations({mangaId:'7'}),
 ]);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://nhentai.net/g/7/');assert.equal(calls[0].userAgentProfile,'browser');
 assert.equal(info.title,'Название');assert.equal(info.pageCount,2);assert.equal(info.coverUrl,'https://t3.nhentai.net/galleries/99/cover.webp');
 assert.equal(chapters[0].id,'7');assert.equal(info.languageFlagData,languageFlagData('english'));
 assert.deepEqual(pageList,[{index:0,imageUrl:'https://i3.nhentai.net/galleries/99/1.webp'},{index:1,imageUrl:'https://i3.nhentai.net/galleries/99/2.jpg.webp'}]);
 assert.equal(recommendations.items[0].languageFlagData,languageFlagData('english'));assert.equal(recommendations.items[0].coverUrl,'https://t4.nhentai.net/galleries/88/thumb.webp');
});

test('nhentai validates cached response status, gallery identity and complete full-size page paths',()=>{
 assert.equal(nhDetails(cachedTitle({...modernGallery,title:{english:'',pretty:'Readable title'}}),'7','https://nhentai.net').info.title,'Readable title');
 const wrongCover=cachedTitle();wrongCover.cover.src='https://t2.nhentai.net/galleries/98/cover.webp';assert.throws(()=>nhPages(nhDetails(wrongCover,'7','https://nhentai.net')),{code:'parse_error'});
 for(const value of [{...modernGallery,id:8},{...modernGallery,num_pages:3}]) {
  const title=cachedTitle(value);
  if(value.id!==7)assert.throws(()=>nhDetails(title,'7','https://nhentai.net'),{code:'parse_error'});
  else assert.throws(()=>nhPages(nhDetails(title,'7','https://nhentai.net')),{code:'parse_error'});
 }
 for(const path of ['https://evil.example/1.webp','galleries/98/1.webp','galleries/99/1t.webp','galleries/99/../1.webp','galleries/99/1.webp?redirect=1']) {
  const title=cachedTitle({...modernGallery,pages:[{number:1,path},modernGallery.pages[1]]});
  assert.throws(()=>nhPages(nhDetails(title,'7','https://nhentai.net')),{code:'parse_error'});
 }
 const bad=cachedTitle();bad.cached[0].data=JSON.stringify({status:403,body:JSON.stringify(modernGallery)});
 assert.throws(()=>nhDetails(bad,'7','https://nhentai.net'),{code:'parse_error'});
 const malformed=cachedTitle();malformed.cached[0].data='not JSON';assert.throws(()=>nhDetails(malformed,'7','https://nhentai.net'),{code:'parse_error'});
});

test('nhentai catalog keeps current language classes and does not use the home popularity teaser',async()=>{
 const queries=[],source=createNh({baseUrl:'https://nhentai.net',http:{request:async input=>({body:'HTML',url:input.url})},html:{extract:async(_,projection)=>(queries.push(projection),[{...row,class:'gallery lang-jp',languageTags:null,image:{src:'https://t2.nhentai.net/galleries/99/thumb.webp'}}])}});
 const rows=await source.getLatest();assert.equal(rows[0].languageFlagData,languageFlagData('japanese'));
 assert.equal(rows[0].coverUrl,'https://t2.nhentai.net/galleries/99/thumb.webp');
 assert.ok(queries[0].selector.includes(':not(.index-popular)'));
});

test('gallery Cloudflare challenges are actionable errors and real challenge scripts are not false positives',async()=>{
 for(const reply of [{body:'<title>Один момент…</title>'},{body:'<title>Just a moment...</title>'},{body:'verification',headers:{'cf-mitigated':'challenge'}}]) {
  const source=createNh({baseUrl:'https://nhentai.net',http:{request:async()=>reply},html:{extract:async()=>assert.fail('Must not parse a verification page')}});
  await assert.rejects(source.getLatest(),{code:'challenge_required'});
 }
 const source=createNh({baseUrl:'https://nhentai.net',http:{request:async()=>({body:'<title>nhentai</title><script>let flag="cf-chl-example";</script>'})},html:{extract:async()=>[]}});
 assert.deepEqual(await source.getLatest(),[]);
});
for(const kind of ['three','nh'])test(`${kind}: details, chapters and recommendations share one title read; failures are retryable`,async()=>{
 const {source,calls}=fixture(kind,{fail:true});await assert.rejects(source.getDetails({mangaId:'7'}),e=>e.code==='offline');const [d,c]=await Promise.all([source.getDetails({mangaId:'7'}),source.getChapters({mangaId:'7'})]);await source.getRecommendations({mangaId:'7'});assert.equal(c.length,1);assert.equal(d.id,'7');assert.equal(calls.length,2);
 const pages=await source.getPages({mangaId:'7',chapterId:'7'});assert.equal(pages.length,2);assert.equal(calls.length,kind==='three'?3:2);await source.getRecommendations({mangaId:'7',page:2});assert.equal(calls.length,kind==='three'?3:2);
 await assert.rejects(source.getPages({mangaId:'7',chapterId:'8'}),e=>e.code==='parse_error');
});
test('both sources use the chosen mirror for catalog, details and request referer',async()=>{
 for(const create of [createThree,createNh]){const calls=[],source=create({baseUrl:'https://mirror.example',http:{request:async r=>(calls.push(r),{body:'catalog',url:r.url})},html:{extract:async()=>[]}});await source.getLatest({page:2});assert.equal(new URL(calls[0].url).origin,'https://mirror.example');assert.equal(calls[0].headers.Referer,'https://mirror.example/');}
});
test('browser verification and unrelated HTTP failures never become empty catalog success',async()=>{
 for(const create of [createThree,createNh]){
  const source=create({baseUrl:nhBase,http:{request:async()=>({body:'<title>Just a moment</title><script>cf-chl-test</script>'})}});await assert.rejects(source.getLatest({page:2}),e=>e.code==='challenge_required');
  const offline=create({baseUrl:nhBase,http:{request:async()=>{throw Object.assign(Error('offline'),{code:'offline'});}}});await assert.rejects(offline.getLatest({page:2}),e=>e.code==='offline');
 }
});
