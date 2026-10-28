import test from 'node:test';import assert from 'node:assert/strict';
import createThree,{catalogUrl as threeUrl,pages as threePages,selectListing} from '../src/sources/threehentai.mjs';
import createNh,{catalogUrl as nhUrl,details as nhDetails,pages as nhPages,galleryData} from '../src/sources/nhentaito.mjs';
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
 assert.ok(definitions.find(d=>d.id==='all.nsfw.nhentaito').network.imageOrigins.includes('https://supercdn.site'));
 assert.ok(definitions.find(d=>d.id==='all.nsfw.threehentai').auth.cookieOrigins.includes('https://ru.3hentai.net'));
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
 const u=new URL(threeUrl(threeBase,{searchTerm:'Some title',page:2,selectedFilters:{language:['english'],tags:['full color, -other'],sort:['popular']}}));assert.equal(u.pathname,'/search');assert.equal(u.searchParams.get('q'),'Some title language:english tag:"full color" -tag:"other"');assert.equal(u.searchParams.get('sort'),'popular');assert.equal(u.searchParams.get('page'),'2');
 assert.equal(threeUrl(threeBase,{page:2},'popular'),null);assert.equal(new URL(threeUrl(threeBase,{page:2},'latest')).pathname,'/2');
});
test('3Hentai reads the full base64 reader map with original mixed formats and validates every page',()=>{
 assert.deepEqual(threePages([readerScript(threeReader)],'7').map(p=>p.imageUrl),['https://s1.3hentai.net/d99/1.jpg','https://s1.3hentai.net/d99/2.webp']);
 for(const value of [{...threeReader,lastPage:3},{...threeReader,baseUri:'https://3hentai.net/d/8/%s'},{...threeReader,baseUriImg:'https://other.example/%s'},{...threeReader,pages:{1:{f:'1t.jpg'},2:{f:'2.webp'}}}])assert.throws(()=>threePages([readerScript(value)],'7'),e=>e.code==='parse_error');
 assert.throws(()=>threePages(['var readerPages=evil()'],'7'),e=>e.code==='parse_error');
 assert.equal(threePages([readerScript({...threeReader,baseUriImg:'https://mirror.example/media/%s'})],'7','https://mirror.example')[0].imageUrl,'https://mirror.example/media/1.jpg');
});
test('3Hentai separates homepage popularity from latest without requiring unsupported CSS negation',()=>{
 const groups=[{class:'listing-container container-xl text-center',items:[{id:'popular'}]},{class:'listing-container container-xl',items:[{id:'latest'}]}];
 assert.deepEqual(selectListing(groups,'latest'),[{id:'latest'}]);assert.deepEqual(selectListing(groups,'popular'),[{id:'popular'}]);assert.deepEqual(selectListing(groups,'search',{selectedFilters:{sort:['popular']}}),[{id:'popular'}]);
 assert.deepEqual(selectListing([{class:'listing-container bg-container container-xl',items:[{id:'filtered'}]}],'search',{selectedFilters:{sort:['popular'],language:['english']}}),[{id:'filtered'}]);
});
test('nhentai.to uses the exact language/category/tag route instead of the unsupported namespace search',()=>{
 assert.equal(new URL(nhUrl(nhBase,{page:2,selectedFilters:{language:['russian']}})).pathname,'/language/russian/');assert.equal(new URL(nhUrl(nhBase,{selectedFilters:{tags:['full color']}})).pathname,'/tag/full-color/');
 assert.equal(new URL(nhUrl(nhBase,{searchTerm:'Title',page:2})).searchParams.get('q'),'Title');assert.equal(new URL(nhUrl(nhBase,{},'latest')).pathname,'/go');assert.equal(new URL(nhUrl(nhBase,{},'popular')).pathname,'/popular');
 for(const selectedFilters of [{language:['english'],tags:['full color']},{language:['english'],sort:['popular']},{tags:['-other']},{tags:['one,two']}])assert.throws(()=>nhUrl(nhBase,{selectedFilters}),e=>e.code==='unsupported');
 assert.throws(()=>nhUrl(nhBase,{searchTerm:'Title',selectedFilters:{language:['english']}}),e=>e.code==='unsupported');
});
test('nhentai.to data parser tolerates the site trailing comma but never executes constructors or trailing JavaScript',()=>{
 assert.deepEqual(galleryData([nhScript(gallery)]),gallery);
 for(const script of ['new N.gallery({secret:call()})','new N.gallery({"a":[})','new N.gallery({"a":1'])assert.throws(()=>galleryData([script]),e=>e.code==='parse_error');
 const nested={...gallery,title:{english:'A } \\" [ title'}};assert.deepEqual(galleryData([nhScript(nested)]),nested);
});
test('nhentai.to pages use descriptor order instead of shifted PHP array keys and never use thumbnails',()=>{
 const data=nhDetails(nhTitle,'7',nhBase);assert.equal(data.info.pageCount,2);assert.equal(data.info.artist,'Writer');assert.deepEqual(data.info.tags,['Full color']);assert.deepEqual(data.related.map(i=>i.id),['8']);
 assert.deepEqual(nhPages(data).map(p=>p.imageUrl),['https://supercdn.site/galleries/99/1.jpg','https://supercdn.site/galleries/99/2.webp']);
 assert.throws(()=>nhPages({...data,info:{...data.info,pageCount:3}}),e=>e.code==='parse_error');assert.throws(()=>nhPages({...data,gallery:{...gallery,images:{pages:[{t:'unknown'},{t:'w'}]}}}),e=>e.code==='parse_error');
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
