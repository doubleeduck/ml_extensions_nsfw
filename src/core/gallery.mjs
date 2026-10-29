import {chapter,filter,manga,normalizeText,parseError,record,string} from './data.mjs';
import {requireArray} from './http.mjs';
import {recent} from './recent.mjs';

export const languages=[['english','Английский'],['japanese','Японский'],['chinese','Китайский'],['russian','Русский'],['korean','Корейский'],['spanish','Испанский'],['french','Французский'],['italian','Итальянский'],['german','Немецкий'],['portuguese','Португальский'],['polish','Польский'],['thai','Тайский'],['vietnamese','Вьетнамский'],['indonesian','Индонезийский']];
export const fields=[['tags','tag','Теги'],['artists','artist','Художник'],['groups','group','Группа'],['parodies','parody','Пародия'],['characters','character','Персонаж']];
export function galleryFilters(sorts,{limited=false}={}) {
  return [{...filter('sort','sort','Сортировка',sorts),supportsDirection:false},{...filter('singleSelect','language','Язык',languages),...(limited?{caption:'Выберите одну рубрику без поиска и популярности: сайт не объединяет эти условия.'}:{})},
    filter('singleSelect','category','Категория',[['doujinshi','Додзинси'],['manga','Манга'],['artistcg','Сет художника'],['gamecg','Игровой сет'],['imageset','Набор изображений'],['western','Западный комикс']]),
    ...fields.map(([key,,label])=>({...filter('text',key,label),caption:limited?'Одна точная рубрика без других фильтров и поиска.':'Через запятую; «-» перед значением исключает его.'}))];
}
export function numericId(value,prefix) {
  const raw=String(value??'').trim();if(/^[1-9]\d{0,14}$/u.test(raw))return raw;
  let path;try{path=new URL(raw,'https://example.org').pathname;}catch{throw parseError('Invalid gallery ID.');}
  const match=new RegExp(`^/${prefix}/([1-9]\\d{0,14})/?$`,'u').exec(path);if(!match)throw parseError('Invalid gallery ID.');return match[1];
}
export function imageUrl(raw,base) {
  const row=record(raw),value=string(row.lazy)??string(row.src)??(typeof raw==='string'?raw:null);
  if(!value||/^(?:data|blob|javascript):/iu.test(value))return null;
  let url;try{url=new URL(value,base);}catch{return null;}return url.protocol==='https:'?url.href:null;
}
export function listing(rows,base,prefix) {
  const seen=new Set(),items=[];
  for(const row of requireArray(rows,'Gallery listing')) {
    let id;try{id=numericId(row.href,prefix);}catch{continue;}
    const title=normalizeText(row.title??record(row.image).alt),coverUrl=imageUrl(row.image,base);
    if(!title||!coverUrl||seen.has(id))continue;seen.add(id);items.push(manga({id,title,coverUrl,languageFlagData:row.languageFlagData??null,ageRating:'18+'}));
  }
  return items;
}
export const picture={selector:'img',fields:{lazy:{attr:'data-src'},src:{attr:'src'},alt:{attr:'alt'}}};
export const scripts={selector:'script:not([src])',all:true,text:true,normalizeWhitespace:false};
export default function createGallery(ctx,adapter) {
  const base=new URL(ctx.baseUrl).origin,id=value=>numericId(value,adapter.prefix);
  async function html(url,projection) {
    const response=await ctx.http.request({method:'GET',url,responseType:'text',userAgentProfile:'browser',headers:{Accept:'text/html,application/xhtml+xml',Referer:`${base}/`}});
    if(typeof response.body!=='string'||!response.body.trim())throw parseError('Empty gallery response.');
    if(/cf-chl-|<title>\s*Just a moment/iu.test(response.body))throw Object.assign(Error('Gallery browser verification is required.'),{code:'challenge_required',phase:'http'});
    return ctx.html.extract(response.body,{...projection,baseUrl:response.url??url});
  }
  const title=recent(async key=>adapter.details(await html(new URL(adapter.path?.(key)??`/${adapter.prefix}/${key}/`,base).href,adapter.detailsProjection),key,base));
  async function catalog(query,mode) {
    const target=adapter.url(base,query,mode);if(!target)return [];
    try{const rows=await html(target,{...adapter.listingProjection,selector:adapter.selector(mode,query)});return listing(adapter.items?adapter.items(rows,mode,query):rows,base,adapter.prefix);}
    catch(error){if(Number(query.page)>1&&error.code==='not_found')return [];throw error;}
  }
  return {
    async getFilters(){return adapter.filters();},
    async getPopular(query={}){return catalog(query,'popular');},
    async getLatest(query={}){return catalog(query,'latest');},
    async search(query={}){return catalog(query,'search');},
    async getDetails({mangaId}){return (await title(id(mangaId))).info;},
    async getChapters({mangaId}){const key=id(mangaId);await title(key);return [chapter({id:key,title:'Галерея',number:1})];},
    async getPages({mangaId,chapterId}){const key=id(mangaId);if(id(chapterId)!==key)throw parseError('Gallery chapter belongs to another title.');
      const [data,reader]=await Promise.all([title(key),adapter.readerProjection?html(new URL(adapter.readerPath(key),base).href,adapter.readerProjection):null]);
      const pages=adapter.pages(reader??data,key,base);if(pages.length!==data.info.pageCount)throw Object.assign(Error('Gallery reader is incomplete.'),{code:'chapter_unavailable',phase:'parse'});return pages;},
    async getRecommendations({mangaId,page=1}){const current=Math.max(1,Math.trunc(page)||1),key=id(mangaId);return {items:current===1?(await title(key)).related:[],page:current,hasNextPage:false};},
  };
}
