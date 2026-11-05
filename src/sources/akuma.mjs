import {chapter,filter,isoDate,manga,normalizeText,parseError,record,string} from '../core/data.mjs';
import {requireArray,requireHtmlBody,requireRecord,urlWithQuery} from '../core/http.mjs';
import {classFlagData,languageFlagData} from '../core/gallery_flags.mjs';
import {recent} from '../core/recent.mjs';

const languages=[['english','Английский'],['japanese','Японский'],['chinese','Китайский'],['russian','Русский'],['korean','Корейский'],
  ['spanish','Испанский'],['french','Французский'],['german','Немецкий'],['italian','Итальянский'],['portuguese','Португальский'],
  ['ukrainian','Украинский'],['arabic','Арабский'],['catalan','Каталанский'],['cebuano','Себуанский'],['czech','Чешский'],['danish','Датский'],
  ['dutch','Нидерландский'],['esperanto','Эсперанто'],['estonian','Эстонский'],['hindi','Хинди'],['hungarian','Венгерский'],
  ['indonesian','Индонезийский'],['javanese','Яванский'],['polish','Польский'],['turkish','Турецкий'],['vietnamese','Вьетнамский']];
const categories=[['doujinshi','Додзинси'],['manga','Манга'],['image set','Набор изображений'],['artist cg','Сет художника'],
  ['game cg','Игровой сет'],['western','Западный комикс'],['non-h','Без эротики'],['cosplay','Косплей'],['misc','Другое']];
const fields=[['groups','group','Группы'],['artists','artist','Художники'],['parodies','parody','Пародии'],['characters','character','Персонажи']];
const marks={female:'♀',male:'♂',other:'◊'};
const text=selector=>({selector,text:true});
const guardScript='https://check.ddos-guard.net/check.js';
const guardPage=body=>typeof body==='string'&&/<title[^>]*>\s*DDoS-Guard\s*<\/title>/iu.test(body);
const guardRequired=()=>Object.assign(Error('Akuma browser verification is required.'),{code:'challenge_required',phase:'http'});
export function buildFilters() {
  return [filter('singleSelect','language','Язык',languages),filter('triStateMultiSelect','categories','Категории',categories),
    {...filter('text','tags','Теги'),caption:'Через запятую; «-» исключает. Поддерживаются female:, male:, other: и метки ♀, ♂, ◊ из карточки.'},
    ...fields.map(([key,,label])=>({...filter('text',key,label),caption:'Через запятую; «-» перед значением исключает его.'})),
    {...filter('singleSelect','collection','Моя коллекция',[['favorited','Избранное'],['read','Прочитанное'],['commented','С комментариями']]),caption:'Требуется вход на сайте.'}];
}
const quote=value=>{
  const text=normalizeText(value.replace(/["\\]/gu,' '));
  if(!text)throw parseError('Empty Akuma filter.');
  return `"${text}"`;
};
export function searchQuery({searchTerm='',selectedFilters={}}={}) {
  const terms=[normalizeText(searchTerm)],language=selectedFilters.language?.[0];
  if(language){if(!languages.some(([value])=>value===language))throw parseError('Invalid Akuma language.');terms.push(`language:${language}$`);}
  for(const raw of requireArray(selectedFilters.categories??[],'Akuma categories')) {
    const match=/^(include|exclude):(.+)$/u.exec(raw);
    if(!match||!categories.some(([value])=>value===match[2]))throw parseError('Invalid Akuma category.');
    terms.push(`${match[1]==='exclude'?'-':''}category:${quote(match[2])}`);
  }
  for(const [key,namespace] of [['tags','other'],...fields]) {
    for(const raw of (selectedFilters[key]?.[0]??'').split(',').map(value=>value.trim()).filter(Boolean)) {
      const excluded=raw.startsWith('-');let value=excluded?raw.slice(1).trim():raw,field=namespace;
      if(key==='tags') {
        const prefix=/^(female|male|other):\s*(.*)$/iu.exec(value),suffix=/\s*([♀♂◊])$/u.exec(value);
        if(prefix){field=prefix[1].toLowerCase();value=prefix[2];}
        else if(suffix){field=Object.keys(marks).find(key=>marks[key]===suffix[1]);value=value.slice(0,suffix.index);}
      }
      terms.push(`${excluded?'-':''}${field}:${quote(value)}`);
    }
  }
  const collection=selectedFilters.collection?.[0];
  if(collection){if(!['favorited','read','commented'].includes(collection))throw parseError('Invalid Akuma collection.');terms.push(`opt:${collection}`);}
  return [...new Set(terms.filter(Boolean))].join(' ');
}
export function normalizeId(raw) {
  const value=string(raw);
  if(value&&/^[A-Za-z0-9_-]{1,64}$/u.test(value))return value;
  let id;try{id=new URL(value,'https://akuma.moe').pathname.match(/^\/g\/([A-Za-z0-9_-]{1,64})\/?$/u)?.[1]}catch{}
  if(!id)throw parseError('Invalid Akuma gallery ID.');return id;
}
const image={selector:'img',fields:{src:{attr:'src'},lazy:{attr:'data-src'}}};
export const catalogProjection={fields:{title:text('title'),csrf:{selector:'meta[name="csrf-token"]',attr:'content'},alerts:{selector:'.alert',all:true,text:true},
  catalog:{selector:'.post-loop',fields:{items:{selector:'li',all:true,fields:{href:{selector:'a[href*="/g/"]',attr:'href'},
    title:text('.overlay-title, .title'),image,flag:{selector:'.flag-icon',attr:'class'}}}}},next:{selector:'.page-item a[rel~="next"]',attr:'href'}}};
function siteErrors(data) {
  const alerts=requireArray(data.alerts??[],'Akuma notices').map(normalizeText).join(' ');
  if(/Max keywords of 3 exceeded\./u.test(alerts))throw Object.assign(Error('Sign in to Akuma to combine more than three search terms.'),{code:'auth_required',phase:'parse'});
  if(/Max keywords of 8 exceeded\./u.test(alerts))throw parseError('Akuma allows at most eight search terms.');
}
function mediaUrl(raw,base) {
  const value=typeof raw==='string'?string(raw):string(record(raw).lazy)??string(record(raw).src);
  let url;try{url=new URL(value,base)}catch{return null}
  const host=new URL(base).hostname;
  return value&&url.protocol==='https:'&&!url.username&&!url.password&&
    (url.hostname===host||url.hostname.endsWith(`.${host}`)||/(?:^|\.)akuma\.moe$/u.test(url.hostname))?url.href:null;
}
export function parseCatalog(input,base,query,cursor=null) {
  const data=requireRecord(input,'Akuma catalog');siteErrors(data);
  if(!normalizeText(data.title).toLowerCase().includes('akuma.moe'))throw parseError('Akuma catalog is incomplete.');
  const items=[],seen=new Set();
  for(const value of requireArray(requireRecord(data.catalog,'Akuma thumbnail catalog').items,'Akuma cards')) {
    const row=requireRecord(value,'Akuma card');
    let id;try{id=normalizeId(row.href)}catch{continue}
    if(seen.has(id))continue;
    const title=normalizeText(row.title),coverUrl=mediaUrl(row.image,base);
    if(!title||!coverUrl)throw parseError('Akuma thumbnail card is incomplete.');
    seen.add(id);items.push(manga({id,title,coverUrl,ageRating:'18+',languageFlagData:classFlagData(String(row.flag??'').replace(/flag-icon-/gu,'lang-'))}));
  }
  let next=null;
  if(string(data.next)) {
    let url;try{url=new URL(data.next,base)}catch{throw parseError('Invalid Akuma next page.');}
    next=url.searchParams.get('cursor');
    if(url.origin!==new URL(base).origin||url.pathname!=='/'||(url.searchParams.get('q')??'')!==query||!next||next.length>4096||next===cursor||!items.length)throw parseError('Invalid Akuma pagination cursor.');
  }
  return {items,next};
}
export const titleProjection={fields:{csrf:{selector:'meta[name="csrf-token"]',attr:'content'},title:text('.entry-title'),secondary:text('.entry-title + span'),
  cover:{selector:'.img-thumbnail',attr:'src'},preview:{selector:'a.page-item img',attr:'src'},alerts:{selector:'.alert',all:true,text:true},
  rows:{selector:'ul.info-list > li.meta-data',all:true,fields:{label:text('.data'),values:{selector:'.value',all:true,text:true}}}}};
export function parseTitle(input,id,base) {
  const data=requireRecord(input,'Akuma gallery');siteErrors(data);
  const title=normalizeText(data.title),coverUrl=mediaUrl(data.cover,base),metadata=new Map();
  for(const value of requireArray(data.rows,'Akuma metadata')) {
    const row=requireRecord(value,'Akuma metadata row');
    metadata.set(normalizeText(row.label).replace(/\s*:$/u,'').toLowerCase(),requireArray(row.values,'Akuma values').map(normalizeText).filter(Boolean));
  }
  const values=key=>metadata.get(key)??[],count=Number(values('pages')[0]);
  if(!title||!coverUrl||!Number.isSafeInteger(count)||count<1||count>20000)throw parseError('Akuma gallery metadata is incomplete.');
  const date=values('date')[0]?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?/u)?.[0];
  return {csrf:string(data.csrf),preview:mediaUrl(data.preview,base),uploadedAt:date?isoDate(date.replace(' ','T')+'Z'):null,
    info:manga({id:normalizeId(id),title,coverUrl,secondaryTitle:string(data.secondary),author:values('group').join(', ')||null,artist:values('artist').join(', ')||null,
      type:values('category')[0]??null,status:'completed',ageRating:'18+',pageCount:count,languageFlagData:values('language').map(value=>languageFlagData(value.toLowerCase())).find(Boolean)??null,
      tags:[...new Set(Object.entries(marks).flatMap(([field,mark])=>values(field).map(value=>`${value} ${mark}`)))],
      description:[['Язык',values('language')],['Пародии',values('parody')],['Персонажи',values('character')]].filter(([,values])=>values.length).map(([label,values])=>`${label}: ${values.join(', ')}`).join('\n')||null})};
}
export function parsePages(input,title) {
  const files=requireArray(input,'Akuma original images');
  if(files.length!==title.info.pageCount)throw parseError('Akuma original image list is incomplete.');
  const preview=new URL(title.preview??'https://invalid.example'),marker=preview.pathname.indexOf('/tbn/');
  if(marker<0)throw parseError('Akuma original image directory is missing.');
  const prefix=new URL(preview.pathname.slice(0,marker+1),preview.origin),seen=new Set();
  return files.map((file,index)=>{
    if(typeof file!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|gif|webp|avif)$/iu.test(file)||file.length>256||seen.has(file))throw parseError('Invalid Akuma original image.');
    seen.add(file);return {index,imageUrl:new URL(file,prefix).href};
  });
}
export default function createAkuma(ctx) {
  const base=new URL(ctx.baseUrl).origin,contexts=new Map(),inflight=new Map();
  let csrf=null,csrfPending=null,guardPending=null,guardRevision=0;
  function send(url,body) {
    return ctx.http.request({method:body==null?'GET':'POST',url,responseType:'text',userAgentProfile:'browser',
      headers:{Accept:'text/html,application/json',Referer:`${base}/`,...(body==null?{}:{Origin:base,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/x-www-form-urlencoded'})},body});
  }
  function renewGuard() {
    if(!guardPending)guardPending=(async()=>{
      // Read the provider's cookie endpoint as data. Never execute its script
      // or send the site's session to the provider's separate origin.
      const response=await send(guardScript);
      const path=typeof response.body==='string'?/['"](\/\.well-known\/ddos-guard\/[^'"\s<>\\]*)['"]/u.exec(response.body)?.[1]:null;
      if(!path||path.length>2048)throw guardRequired();
      const url=new URL(path,base);
      if(url.origin!==base||!url.pathname.startsWith('/.well-known/ddos-guard/')||url.hash)throw guardRequired();
      // The host imports Set-Cookie before returning, including for HTTP 204.
      await send(url.href);
      guardRevision++;
    })().catch(error=>{
      if(error.httpStatus===403&&guardPage(error.body))throw guardRequired();
      throw error;
    }).finally(()=>{guardPending=null;});
    return guardPending;
  }
  async function request(url,body) {
    for(let attempt=0;attempt<2;attempt++) {
      const revision=guardRevision;
      try {
        const response=await send(url,body);
        if(guardPage(response.body))throw Object.assign(guardRequired(),{httpStatus:response.status??200,body:response.body});
        requireHtmlBody(response,'Akuma');
        return response;
      } catch(error) {
        if(![200,403].includes(error.httpStatus)||!guardPage(error.body))throw error;
        if(attempt)throw guardRequired();
        if(revision===guardRevision)await renewGuard();
      }
    }
  }
  async function html(url,projection) {
    const response=await request(url),data=await ctx.html.extract(response.body,{...projection,baseUrl:response.url??url});
    if(string(data?.csrf))csrf=data.csrf;
    return data;
  }
  async function token() {
    if(csrf)return csrf;
    if(!csrfPending)csrfPending=html(urlWithQuery('/',base,{q:''}),{fields:{csrf:{selector:'meta[name="csrf-token"]',attr:'content'}}}).finally(()=>{csrfPending=null;});
    await csrfPending;
    if(!csrf)throw parseError('Akuma CSRF token is missing.');return csrf;
  }
  async function post(url,fields={}) {
    for(let attempt=0;attempt<2;attempt++) {
      const value=await token();
      try{return await request(url,new URLSearchParams({...fields,_token:value}).toString());}
      catch(error){if(attempt||error.httpStatus!==419)throw error;if(csrf===value)csrf=null;}
    }
  }
  function coalesce(key,load) {
    if(inflight.has(key))return inflight.get(key);
    const promise=Promise.resolve().then(load).finally(()=>{if(inflight.get(key)===promise)inflight.delete(key);});
    inflight.set(key,promise);return promise;
  }
  async function readCatalog(query,cursor) {
    const url=urlWithQuery('/',base,{q:query,...(cursor?{cursor}:{})});
    return coalesce(url,async()=>{
      // Always request thumbnails, including when an account prefers Minimal.
      const response=await post(url,{view:'3'}),data=await ctx.html.extract(response.body,{...catalogProjection,baseUrl:response.url??url});
      if(string(data?.csrf))csrf=data.csrf;
      return parseCatalog(data,base,query,cursor);
    });
  }
  function context(key,refresh) {
    let value=contexts.get(key);
    if(refresh||!value)value={cursors:new Map([[1,null]])};
    contexts.delete(key);contexts.set(key,value);
    while(contexts.size>8)contexts.delete(contexts.keys().next().value);
    return value;
  }
  async function catalog(feed,query={}) {
    const q=searchQuery(query),page=Math.max(1,Math.trunc(query.page??1));
    if(!Number.isSafeInteger(page))throw parseError('Invalid Akuma page.');
    return coalesce(JSON.stringify([feed,q,page]),async()=>{
      const state=context(JSON.stringify([feed,q]),page===1);
      let current=Math.max(...[...state.cursors.keys()].filter(value=>value<=page));
      if(page-current>200)throw Object.assign(Error('Akuma pagination work limit exceeded.'),{code:'resource_limit',phase:'pagination'});
      while(current<=page) {
        const cursor=state.cursors.get(current);
        if(current>1&&cursor==null)return [];
        const result=await readCatalog(q,cursor);
        state.cursors.set(current+1,result.next);
        while(state.cursors.size>256)state.cursors.delete([...state.cursors.keys()].find(value=>value!==1));
        if(current===page)return result.items;
        if(!result.next)return [];
        current++;
      }
    });
  }
  const title=recent(async id=>parseTitle(await html(new URL(`/g/${id}`,base).href,titleProjection),id,base));
  const pages=recent(async id=>{
    const data=await title(id);if(data.csrf)csrf=data.csrf;
    const response=await post(new URL(`/g/${id}`,base).href);
    let files;try{files=JSON.parse(response.body)}catch{throw parseError('Akuma original image response is not JSON.');}
    return parsePages(files,data);
  },{ttlMs:60000});
  return {
    async getFilters(){return buildFilters();},
    getPopular:query=>catalog('popular',query),getLatest:query=>catalog('latest',query),search:query=>catalog('search',query),
    async getDetails({mangaId}){return (await title(normalizeId(mangaId))).info;},
    async getChapters({mangaId}){const data=await title(normalizeId(mangaId));return [chapter({id:data.info.id,title:'Галерея',number:1,uploadedAt:data.uploadedAt})];},
    async getPages({mangaId,chapterId}){const id=normalizeId(chapterId);if(mangaId!=null&&normalizeId(mangaId)!==id)throw parseError('Akuma chapter belongs to another gallery.');return pages(id);},
  };
}
