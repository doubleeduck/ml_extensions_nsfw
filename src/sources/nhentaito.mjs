import createGallery,{fields,galleryFilters,imageUrl,languages,listing,picture,scripts} from '../core/gallery.mjs';
import {filter,manga,normalizeText,parseError,record,string} from '../core/data.mjs';
import {requireArray,requireRecord,urlWithQuery} from '../core/http.mjs';
import {classFlagData,tagFlagData,languageFlagData} from '../core/gallery_flags.mjs';
import {recent} from '../core/recent.mjs';

const sorts=[['latest','Последние'],['popular','Популярные за всё время'],['popular-today','Популярные за день'],['popular-week','Популярные за неделю'],['popular-month','Популярные за месяц']];
export function buildFilters(languageOptions=languages) {
  const filters=galleryFilters(sorts);
  filters.find(row=>row.key==='language').options=languageOptions.map(([value,label])=>({value,label,caption:null}));
  return [...filters,
    {...filter('text','min_pages','Минимум страниц'),caption:'Минимальное число страниц включительно.'},
    {...filter('text','max_pages','Максимум страниц'),caption:'Максимальное число страниц включительно.'},
    {...filter('text','exclude','Исключить теги'),caption:'Через запятую; можно сочетать с остальными фильтрами.'}];
}
const quote=value=>`"${normalizeText(value.replace(/["\\]/gu,' '))}"`;
export function catalogUrl(base,{page=1,searchTerm='',selectedFilters={}}={},mode='search') {
  const rawSort=mode==='popular'?'popular':mode==='latest'?'latest':selectedFilters.sort?.[0]??'latest';
  // Existing saved presets can still contain the mirror's former sort IDs.
  const sort=({newest:'latest','most-liked':'popular','most-favorited':'popular',relevance:'latest'})[rawSort]??rawSort,current=Math.max(1,Math.trunc(Number(page))||1);
  if(!sorts.some(([key])=>key===sort))throw parseError('Invalid nhentai.to sort.');
  const terms=[normalizeText(searchTerm)],language=selectedFilters.language?.[0]?.trim();
  if(language&&!/^[a-z][a-z-]{0,127}$/u.test(language))throw parseError('Invalid nhentai.to language.');
  if(language)terms.push(`language:${language}`);
  for(const [key,field] of [['category','category'],...fields.map(([key,field])=>[key,field])]) {
    for(const raw of (selectedFilters[key]?.[0]??'').split(',').map(value=>value.trim()).filter(Boolean)) {
      const excluded=raw.startsWith('-'),value=excluded?raw.slice(1).trim():raw;
      if(!value||!normalizeText(value.replace(/["\\]/gu,' ')))throw parseError('Invalid nhentai.to filter value.');
      terms.push(`${excluded?'-':''}${field}:${quote(value)}`);
    }
  }
  const bounds={};
  for(const key of ['min_pages','max_pages']){const raw=selectedFilters[key]?.[0]?.trim();if(raw){if(!/^[1-9]\d{0,5}$/u.test(raw))throw parseError('Invalid nhentai.to page limit.');bounds[key]=Number(raw);}}
  if(bounds.min_pages&&bounds.max_pages&&bounds.min_pages>bounds.max_pages)throw parseError('Invalid nhentai.to page range.');
  if(bounds.min_pages)terms.push(`pages:>=${bounds.min_pages}`);
  if(bounds.max_pages)terms.push(`pages:<=${bounds.max_pages}`);
  for(const value of (selectedFilters.exclude?.[0]??'').split(',').map(value=>value.trim()).filter(Boolean)) {
    if(!normalizeText(value.replace(/["\\]/gu,' ')))throw parseError('Invalid nhentai.to excluded tag.');
    terms.push(`-tag:${quote(value)}`);
  }
  const q=terms.filter(Boolean).join(' ');
  if(!q&&sort==='latest')return urlWithQuery('/',base,{...(current>1?{page:current}:{})});
  return urlWithQuery('/search',base,{q:q||'pages:>0',page:current,sort:sort==='latest'?'date':sort});
}
const tile={href:{selector:'a.cover',attr:'href'},title:{selector:'.caption',text:true},image:picture,languageTags:{attr:'data-tags'},class:{attr:'class'}};
// The mirror's supercdn.site URLs time out or return 404 for files still served
// by the original CDN. Media IDs and extensions are shared; resolve them once
// while parsing instead of probing/retrying every native image request.
function mediaUrl(raw,base,page=false) {
  const value=imageUrl(raw,base);if(!value)return null;
  const url=new URL(value);
  if(['supercdn.site','t.nhentai.net','i.nhentai.net'].includes(url.hostname)&&
    /^\/galleries\/[1-9]\d*\/(?:cover|thumb|[1-9]\d*t?)\.(?:jpg|png|gif|webp|avif)$/u.test(url.pathname)) {
    url.hostname=page?'i.nhentai.net':'t.nhentai.net';
    url.port='';
  }
  return url.href;
}
const withFlags=(rows,base)=>requireArray(rows,'nhentai.to cards').map(row=>({...row,image:mediaUrl(row.image,base),languageFlagData:classFlagData(row.class)??tagFlagData(row.languageTags)}));
export const detailsProjection={fields:{cover:{selector:'#cover img',fields:picture.fields},scripts,
  cached:{selector:'script[data-sveltekit-fetched][data-url*="/api/v2/galleries/"]',all:true,fields:{url:{attr:'data-url'},data:{text:true,normalizeWhitespace:false}}},
  related:{selector:'.gallery',all:true,fields:tile}}};
function cachedResponse(rows,path,base) {
  for(const row of requireArray(rows??[],'nhentai cached responses')) {
    let url;try{url=new URL(row.url,base)}catch{continue}
    if(url.origin!==new URL(base).origin||url.pathname!==path)continue;
    let cached,data;try{cached=JSON.parse(row.data);data=JSON.parse(cached.body)}catch{throw parseError('Invalid nhentai cached response.')}
    if(cached.status!==200)throw parseError('Invalid nhentai cached response status.');
    return requireRecord(data,'nhentai cached data');
  }
  return null;
}
const languagesProjection={fields:{cached:{selector:'script[data-sveltekit-fetched][data-url*="/api/v2/tags/language"]',all:true,fields:{url:{attr:'data-url'},data:{text:true,normalizeWhitespace:false}}}}};
const languageLabels=new Map([...languages,['ukrainian','Украинский'],['hebrew','Иврит'],['arabic','Арабский'],['khmer','Кхмерский'],['romanian','Румынский'],['greek','Греческий'],['turkish','Турецкий'],['czech','Чешский'],['translated','Переведено'],['textless','Без текста'],['textless-narrative','Без текста в сюжете']]);
export function parseLanguageOptions(input,base) {
  const data=requireRecord(cachedResponse(requireRecord(input,'nhentai languages').cached,'/api/v2/tags/language',base),'nhentai language response');
  const seen=new Set(),options=[];
  for(const row of requireArray(data.result,'nhentai languages')) {
    const tag=requireRecord(row,'nhentai language'),slug=string(tag.slug),name=normalizeText(tag.name);
    if(tag.type!=='language'||!slug||!/^[a-z][a-z-]{0,127}$/u.test(slug)||!name||!(Number(tag.count)>0)||seen.has(slug))continue;
    seen.add(slug);options.push([slug,languageLabels.get(slug)??name]);
  }
  const totalPages=Number(data.num_pages);
  if(!options.length||!Number.isInteger(totalPages)||totalPages<1||totalPages>8)throw parseError('Invalid nhentai language catalog.');
  return {options,totalPages};
}
// Parse only the data literal. Never execute the remote N.gallery constructor.
export function galleryData(input) {
  for(const script of requireArray(input,'nhentai.to scripts')) {
    const marker=/\bnew\s+N\.gallery\s*\(\s*(?=\{)/u.exec(script);if(!marker)continue;
    const start=marker.index+marker[0].length,stack=['}'];let quoted=false,escaped=false;
    for(let i=start+1;i<script.length;i++){
      const char=script[i];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"')quoted=true;else if(char==='{')stack.push('}');else if(char==='[')stack.push(']');else if(char==='}'||char===']'){
        if(stack.pop()!==char)throw parseError('Unbalanced nhentai.to gallery data.');
        if(!stack.length){try{return JSON.parse(script.slice(start,i).replace(/,\s*$/u,'')+char);}catch{throw parseError('Invalid nhentai.to gallery data.');}}
      }if(stack.length>128)throw parseError('nhentai.to gallery data is too deeply nested.');
    }
  }
  throw parseError('nhentai.to gallery data is missing.');
}
export function details(input,id,base) {
  const data=requireRecord(input,'nhentai.to title'),cached=cachedResponse(data.cached,`/api/v2/galleries/${id}`,base),gallery=cached??requireRecord(galleryData(data.scripts),'nhentai.to gallery'),names=record(gallery.title),title=string(names.english)??string(names.pretty)??string(names.japanese);
  if(cached&&String(gallery.id)!==id)throw parseError('Mismatched nhentai cached gallery data.');
  if(!title)throw parseError('nhentai.to title is missing.');
  const tags=requireArray(gallery.tags,'nhentai.to tags'),values=type=>tags.filter(tag=>tag.type===type).map(tag=>normalizeText(tag.name)).filter(Boolean),count=Number(gallery.num_pages);
  if(!Number.isInteger(count)||count<1)throw parseError('Invalid nhentai.to page count.');
  const coverUrl=mediaUrl(data.cover,base);if(!coverUrl)throw parseError('nhentai.to cover is missing.');
  return {gallery,info:manga({id,title,secondaryTitle:string(names.japanese),coverUrl,languageFlagData:values('language').map(languageFlagData).find(Boolean)??null,pageCount:count,artist:values('artist').join(', ')||null,author:values('group').join(', ')||values('artist').join(', ')||null,
    type:values('category')[0]??null,tags:values('tag'),ageRating:'18+',status:'completed',description:[values('language').join(', '),`Страниц: ${count}`].filter(Boolean).join('\n')}),related:listing(withFlags(data.related,base),base,'g').filter(row=>row.id!==id)};
}
export function pages(data) {
  const gallery=data.gallery;
  if(Array.isArray(gallery.pages)) {
    if(gallery.pages.length!==data.info.pageCount)throw parseError('Incomplete nhentai page descriptors.');
    const origin=new URL(data.info.coverUrl),media=String(gallery.media_id);
    if(!/^[1-9]\d*$/u.test(media)||!origin.pathname.startsWith(`/galleries/${media}/`))throw parseError('Mismatched nhentai media origin.');
    origin.hostname=origin.hostname.replace(/^t(?=\d*\.nhentai\.net$)/u,'i');
    return gallery.pages.map((row,index)=>{
      const descriptor=requireRecord(row,'nhentai page'),path=string(descriptor.path),match=path?.match(/^\/?galleries\/([1-9]\d*)\/([1-9]\d*)(?:\.(?:jpg|png|gif|webp|avif)){1,2}$/u);
      if(descriptor.number!==index+1||match?.[1]!==media||Number(match?.[2])!==index+1)throw parseError('Invalid nhentai page descriptor.');
      return {index,imageUrl:origin.origin+'/'+path.replace(/^\//u,'')};
    });
  }
  const raw=record(gallery.images).pages;
  const descriptors=Array.isArray(raw)?raw:Object.values(requireRecord(raw,'nhentai.to page descriptors'));
  if(descriptors.length!==data.info.pageCount)throw parseError('Incomplete nhentai.to page descriptors.');
  const cover=new URL(data.info.coverUrl),media=String(gallery.media_id);
  if(!/^\d+$/u.test(media)||!cover.pathname.startsWith(`/galleries/${media}/`))throw parseError('Mismatched nhentai.to media origin.');
  return descriptors.map((row,index)=>{const extension={j:'jpg',p:'png',g:'gif',w:'webp',a:'avif'}[row.t];if(!extension)throw parseError('Unknown nhentai.to page format.');
    const image=new URL(cover.href);image.pathname=`/galleries/${media}/${index+1}.${extension}`;return {index,imageUrl:mediaUrl(image.href,cover.origin,true)};});
}
export default ctx=>{
  const base=new URL(ctx.baseUrl).origin;
  const loadLanguages=async html=>{
    const first=parseLanguageOptions(await html(urlWithQuery('/languages',base,{sort:'popular'}),languagesProjection),base),options=new Map(first.options);
    for(let page=2;page<=first.totalPages;page++) {
      const next=parseLanguageOptions(await html(urlWithQuery('/languages',base,{sort:'popular',page}),languagesProjection),base);
      for(const [value,label] of next.options)options.set(value,label);
    }
    return [...options];
  };
  const languageCache=()=>recent(loadLanguages,{ttlMs:30*60*1000,limit:1});
  let cachedLanguages=languageCache();
  return createGallery(ctx,{prefix:'g',url:catalogUrl,filters:async({refresh=false}={},html)=>{
    if(refresh)cachedLanguages=languageCache();
    return buildFilters(await cachedLanguages(html));
  },listingProjection:{all:true,fields:tile},items:rows=>withFlags(rows,ctx.baseUrl),
    // Home's popular block contains just five cards. Browse only the full list;
    // popularity is a paginated server search rather than that teaser block.
    selector:()=>'.index-container:not(.index-popular) .gallery, .index-latest .gallery',detailsProjection,details,pages});
};
