import {manga,normalizeText,parseError,record,records,string} from '../core/data.mjs';
import {requireArray,urlWithQuery} from '../core/http.mjs';
import {recent} from '../core/recent.mjs';
import {isValidChapterId,parseCatalog,parseChapters,parseFilters,parseManga,parsePages} from './puremanga_parser.mjs';

export default function createPureManga(ctx) {
  const base = new URL(ctx.baseUrl).origin, api = ctx.parameters.apiBaseUrl, serviceName = ctx.parameters.serviceName;
  async function json(path,query) {
    const response = await ctx.http.request({method:'GET',url:urlWithQuery(path,api,query),responseType:'json',userAgentProfile:'browser',
      headers:{Accept:'application/json','X-Service-Name':serviceName,Referer:`${base}/`,Origin:base}});
    return response.body;
  }
  function titlePath(raw) {
    let url; try {url=new URL(raw,base);} catch {throw parseError('Invalid PureManga title ID.');}
    if (!/^\/content\/[^/?#]+$/u.test(url.pathname)) throw parseError('Invalid PureManga title ID.');
    return url.pathname;
  }
  const title = recent(path=>json(`books/${encodeURIComponent(path.split('/').at(-1))}`));
  const chapters = recent(async path=>{
    const data=record(await title(path));
    if (!string(data.id)) throw parseError('PureManga title UUID is missing.');
    return parseChapters(await json('chapters',{bookId:data.id,moderationStatus:'APPROVED'}),path);
  });
  let filters = null;
  async function catalog({page=1,searchTerm='',selectedFilters={}}={},forcedSort) {
    const sort=selectedFilters.sort ?? [], query={serviceName,page:Math.max(0,(Math.trunc(Number(page))||1)-1),size:30,
      sort:forcedSort ?? `${sort[0] ?? 'viewsCount'},${sort[1] === 'asc' ? 'asc' : 'desc'}`};
    if (searchTerm.trim()) query.search=searchTerm.trim();
    for (const key of ['status','country','contentStatus','formats']) if (selectedFilters[key]?.length) query[key]=[...new Set(selectedFilters[key])];
    for (const [prefix,key] of [['include:','labelsInclude'],['exclude:','labelsExclude']]) {
      const values = [...new Set(['genre','tags'].flatMap(key=>selectedFilters[key] ?? []).filter(value=>prefix === 'include:' ? !value.startsWith('exclude:') : value.startsWith(prefix))
        .map(value=>value.replace(/^(include|exclude):/u,'').trim()).filter(Boolean))];
      if (values.length) query[key]=values;
    }
    for (const [key,min,max,integer] of [['yearMin',1900,2200,true],['yearMax',1900,2200,true],['chaptersCountMin',0,100000,true],['chaptersCountMax',0,100000,true],['averageRatingMin',0,10,false],['averageRatingMax',0,10,false]]) {
      const raw=selectedFilters[key]?.[0]?.trim().replace(',','.');if (!raw) continue;
      const value=Number(raw);
      if (!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value)) throw parseError(`Invalid PureManga ${key}.`);
      query[key]=value;
    }
    if (selectedFilters.strictLabelEqual?.[0] === 'true') query.strictLabelEqual=true;
    return parseCatalog(requireArray(await json('books',query),'PureManga catalog'));
  }
  return {
    async getFilters({refresh=false}={}) {
      if (refresh) filters=null;
      if (filters == null) {
        const pending=json('labels').then(value=>parseFilters(requireArray(value,'PureManga labels')));
        filters=pending;pending.catch(()=>{if(filters===pending)filters=null;});
      }
      return filters;
    },
    async getPopular(query={}) {return catalog(query,'viewsCount,desc');},
    async getLatest({page=1}={}) {return parseCatalog(requireArray(await json('chapter-update-feed',{serviceName,onlyBorderChapters:true,page:Math.max(0,(Math.trunc(Number(page))||1)-1),size:30}),'PureManga updates'));},
    async search(query) {return catalog(query);},
    async getDetails({mangaId}) {return parseManga(await title(titlePath(mangaId)));},
    async getChapters({mangaId}) {return chapters(titlePath(mangaId));},
    async getPages({mangaId,chapterId}) {
      const path=titlePath(mangaId);
      if (!isValidChapterId(chapterId) || !String(chapterId).startsWith(`${path}/`)) throw parseError('Invalid PureManga chapter ID.');
      const pages=parsePages(await json(`chapters/${encodeURIComponent(chapterId.split('/').at(-1))}`));
      if (!pages.length) throw Object.assign(Error('PureManga chapter has no available pages.'),{code:'chapter_unavailable',phase:'parse'});
      return pages;
    },
    async getRecommendations({mangaId,page=1}) {
      const currentPage=Math.max(1,Math.trunc(page)||1),path=titlePath(mangaId);
      if(currentPage>1)return {items:[],page:currentPage,hasNextPage:false};
      const response=await ctx.http.request({method:'GET',url:new URL(path,base).href,responseType:'text',userAgentProfile:'browser',headers:{Accept:'text/html',Referer:`${base}/`}});
      const data=await ctx.html.extract(response.body,{baseUrl:response.url,selector:'h2',textEquals:'Похожее',ascend:2,nextSibling:true,fields:{items:{selector:'a[href^="/content/"]',all:true,
        fields:{path:{attr:'href'},image:{selector:'img',fields:{alt:{attr:'alt'},src:{attr:'src',absoluteUrl:true}}}}}}});
      const seen=new Set([path]),items=[];
      for(const row of records(record(data).items)) {
        if(!/^\/content\/[^/?#]+$/u.test(row.path ?? '')||seen.has(row.path))continue;
        const image=record(row.image),title=normalizeText(image.alt),coverUrl=string(image.src);
        if(!title||!coverUrl||!coverUrl.startsWith('https://'))continue;
        seen.add(row.path);items.push(manga({id:row.path,title,coverUrl}));
      }
      return {items,page:currentPage,hasNextPage:false};
    },
  };
}
