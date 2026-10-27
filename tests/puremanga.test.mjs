import test from 'node:test';
import assert from 'node:assert/strict';
import createPureManga from '../src/sources/puremanga.mjs';
import {sourceDefinitions} from '../src/definitions.mjs';
import {largestBranch,normalizeImageUrl,parseChapters,parseFilters,parseManga,parsePages} from '../src/sources/puremanga_parser.mjs';

const base='https://v1.puremanga.me',api='https://api.inuko.me/v2/',uuid='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const book={id:'book-uuid',slug:'demo',name:{ru:'Название',en:'Title'},poster:'https://static.inuko.me/book/full.webp',description:'Описание',status:'ONGOING',type:'COMIC',year:2024,averageRating:9.4,
  labels:[{slug:'fantasy',name:'Фэнтези',kind:'GENRE'},{slug:'magic',name:'Магия',kind:'TAG'}],relations:[{type:'AUTHOR',publisher:{name:'Writer'}},{type:'ARTIST',publisher:{name:'Artist'}}]};
const rows=[{id:uuid,number:1,volume:1,branchId:'main',name:'Начало',createdAt:'2026-10-27T00:00:00Z'},{id:second,number:1.5,volume:1,branchId:'main',title:'Бонус'}];
const pageUrl=`https://static.inuko.me/chapters/${uuid}/aaaaaaaa-aaaa-saaa-aaaa-aaaaaaaaaaaa.webp?sig=keep`;
function fixture({mirror=base,failBook=false,failLabels=false}={}) {
  const calls=[];let failedBook=false,failedLabels=false;
  const source=createPureManga({baseUrl:mirror,parameters:{apiBaseUrl:api,serviceName:'puremanga.me'},http:{request:async input=>{
    calls.push(input);const u=new URL(input.url);let body;
    if(u.pathname.endsWith('/books/demo')){if(failBook&&!failedBook){failedBook=true;throw Object.assign(Error('auth'),{code:'auth_required'});}body=book;}
    else if(u.pathname.endsWith('/labels')){if(failLabels&&!failedLabels){failedLabels=true;throw Object.assign(Error('timeout'),{code:'timeout'});}body=book.labels;}
    else if(u.pathname.endsWith('/chapters'))body=rows;
    else if(u.pathname.endsWith(`/chapters/${uuid}`)||u.pathname.endsWith(`/chapters/${second}`))body={pages:[{index:1,image:'https://static.inuko.me/2.jpg'},{index:0,image:pageUrl}]};
    else if(u.pathname.endsWith('/chapter-update-feed'))body=[{book}];
    else if(u.origin===new URL(mirror).origin)body='recommendations';
    else body=[book];
    return {status:200,url:input.url,body};
  }},html:{extract:async()=>({items:[{path:'/content/demo',image:{src:book.poster,alt:'Self'}},{path:'/content/other',image:{src:'https://static.inuko.me/other.webp',alt:'Похожее'}},{path:'/content/other',image:{src:book.poster,alt:'Duplicate'}}]})}});
  return {source,calls};
}
test('PureManga belongs only to the NSFW package and declares the real SSO cookie, API service and page decoder',()=>{
  const d=sourceDefinitions().find(d=>d.id==='ru.nsfw.puremanga');assert.equal(d.isNsfw,true);assert.equal(d.metadataOnly,false);assert.equal(d.parameters.serviceName,'puremanga.me');assert.deepEqual(d.auth.rules.cookieAll,['__otaku_session']);assert.ok(d.auth.cookieOrigins.includes('https://sso.inuko.me'));assert.ok(d.auth.cookieOrigins.includes('https://inuko.me'));assert.equal(d.network.transportProfile,'host.platform.v1');assert.equal(d.media.transform.algorithm,'xor');assert.equal(d.media.transform.marker,'x');
});
test('PureManga metadata retains original cover, authors, genre/tag labels and release data',()=>{
  const d=parseManga(book);assert.equal(d.id,'/content/demo');assert.equal(d.coverUrl,book.poster);assert.equal(d.author,'Writer');assert.equal(d.artist,'Artist');assert.deepEqual(d.tags,['Фэнтези','Магия']);assert.equal(d.releaseYear,'2024');
});
test('PureManga never mixes alternative chapter branches or lets duplicates alter branch selection',()=>{
  const alternatives=[...rows,{...rows[0]},{...rows[0],id:'alternate',branchId:'other'}];assert.deepEqual(largestBranch(alternatives).map(c=>c.id),[uuid,second]);assert.deepEqual(parseChapters(alternatives,'/content/demo').map(c=>c.id),[`/content/demo/${second}`,`/content/demo/${uuid}`]);assert.match(parseChapters(rows,'/content/demo')[0].title,/Том 1\. Глава 1\.5: Бонус/u);
});
test('PureManga details/chapters share one book read; chapter lists are cached and failed auth reads are retryable',async()=>{
  const {source,calls}=fixture({failBook:true});await assert.rejects(source.getDetails({mangaId:'/content/demo'}),e=>e.code==='auth_required');
  await Promise.all([source.getDetails({mangaId:'/content/demo'}),source.getChapters({mangaId:'/content/demo'})]);await source.getChapters({mangaId:'/content/demo'});assert.equal(calls.filter(c=>new URL(c.url).pathname.endsWith('/books/demo')).length,2);assert.equal(calls.filter(c=>new URL(c.url).pathname.endsWith('/chapters')).length,1);
});
test('PureManga every API request sends the actual service name and uses zero-based page numbers',async()=>{
  const {source,calls}=fixture();await source.getPopular({page:2});const r=calls[0],u=new URL(r.url);assert.equal(r.headers['X-Service-Name'],'puremanga.me');assert.equal(u.searchParams.get('serviceName'),'puremanga.me');assert.equal(u.searchParams.get('page'),'1');assert.equal(u.searchParams.get('sort'),'viewsCount,desc');
});
test('PureManga latest uses the chapter-update feed rather than inheriting catalog sorting',async()=>{
  const {source,calls}=fixture();await source.getLatest({page:3});const u=new URL(calls[0].url);assert.equal(u.pathname,'/v2/chapter-update-feed');assert.equal(u.searchParams.get('page'),'2');assert.equal(u.searchParams.get('onlyBorderChapters'),'true');
});
test('PureManga filters support genre/tag exclusion, strict matching, ranges and refresh after errors',async()=>{
  const parsed=parseFilters(book.labels);assert.equal(parsed.find(f=>f.key==='genre').kind,'triStateMultiSelect');assert.equal(parsed.find(f=>f.key==='tags').kind,'triStateMultiSelect');
  const {source,calls}=fixture({failLabels:true});await assert.rejects(source.getFilters(),e=>e.code==='timeout');await Promise.all([source.getFilters(),source.getFilters()]);await source.getFilters();assert.equal(calls.length,2);await source.getFilters({refresh:true});assert.equal(calls.length,3);
  await source.search({searchTerm:' Имя ',page:2,selectedFilters:{sort:['averageRating','asc'],genre:['include:fantasy','exclude:drama'],tags:['exclude:magic'],yearMin:['2020'],averageRatingMin:['9,2'],strictLabelEqual:['true']}});
  const u=new URL(calls.at(-1).url);assert.equal(u.searchParams.get('search'),'Имя');assert.deepEqual(u.searchParams.getAll('labelsInclude'),['fantasy']);assert.deepEqual(u.searchParams.getAll('labelsExclude'),['drama','magic']);assert.equal(u.searchParams.get('sort'),'averageRating,asc');assert.equal(u.searchParams.get('averageRatingMin'),'9.2');assert.equal(u.searchParams.get('strictLabelEqual'),'true');
});
test('PureManga page normalization selects the encrypted full original and preserves signing query parameters',()=>{
  const pages=parsePages({pages:[{index:1,image:'https://static.inuko.me/2.jpg'},{index:0,image:pageUrl}]});assert.equal(pages.length,2);assert.equal(pages[0].imageUrl,pageUrl.replace('-saaa-','-xaaa-'));assert.equal(pages[1].index,1);assert.equal(normalizeImageUrl('https://other.example/a.jpg'),'https://other.example/a.jpg');
  for(const value of [{pages:[{index:0}]},{pages:[{index:0,image:'javascript:bad'}]},{pages:null},{pages:[{index:-1,image:pageUrl}]}])assert.throws(()=>parsePages(value),e=>e.code==='parse_error');
});
test('PureManga rejects invalid or foreign title/chapter pairs before making a request',async()=>{
  const {source,calls}=fixture();await assert.rejects(source.getPages({mangaId:'/content/demo',chapterId:`/content/other/${uuid}`}),e=>e.code==='parse_error');await assert.rejects(source.getPages({mangaId:'/content/demo',chapterId:'../bad'}),e=>e.code==='parse_error');assert.equal(calls.length,0);
});
test('PureManga recommendations read only the similar section, remove duplicates and terminate without extra requests',async()=>{
  const {source,calls}=fixture();const r=await source.getRecommendations({mangaId:'/content/demo'});assert.deepEqual(r.items.map(i=>i.id),['/content/other']);assert.equal(r.hasNextPage,false);await source.getRecommendations({mangaId:'/content/demo',page:2});assert.equal(calls.length,1);
});
test('PureManga custom mirror applies to web requests and referer while its API/CDN stay independent',async()=>{
  const {source,calls}=fixture({mirror:'https://mirror.example'});await source.getRecommendations({mangaId:'/content/demo'});await source.getPopular();assert.equal(calls[0].url,'https://mirror.example/content/demo');assert.equal(new URL(calls[1].url).origin,'https://api.inuko.me');assert.equal(calls[1].headers.Referer,'https://mirror.example/');
});
