import createGallery,{fields,galleryFilters,imageUrl,languages,listing,picture,scripts} from '../core/gallery.mjs';
import {filter,manga,normalizeText,parseError,record,string} from '../core/data.mjs';
import {requireArray,requireRecord,urlWithQuery} from '../core/http.mjs';
import {tagFlagData,languageFlagData} from '../core/gallery_flags.mjs';

const sorts=[['latest','Последние'],['popular','Популярные'],['most-liked','Больше отметок «Нравится»'],['relevance','По совпадению']];
export function buildFilters() {
  const filters=galleryFilters(sorts,{limited:true});
  filters.find(row=>row.key==='sort').caption='В поиске поддерживаются все варианты; внутри точной рубрики сайт показывает только последние.';
  filters.find(row=>row.key==='language').caption='В поиске: английский, японский, китайский и корейский. Остальные языки доступны отдельной рубрикой без поиска.';
  return [...filters,
    {...filter('text','min_pages','Минимум страниц'),caption:'Число страниц; применяется вместе с поиском по названию.'},
    {...filter('text','max_pages','Максимум страниц'),caption:'Число страниц; применяется вместе с поиском по названию.'},
    {...filter('text','exclude','Исключить теги'),caption:'Через запятую; применяется вместе с поиском по названию.'}];
}
const unsupported=()=>Object.assign(Error('nhentai.to combines language, sorting, page limits and exclusions with title search. Exact taxonomy pages cannot be combined or sorted.'),{code:'unsupported',phase:'filters'});
export function catalogUrl(base,{page=1,searchTerm='',selectedFilters={}}={},mode='search') {
  const sort=mode==='popular'?'popular':mode==='latest'?'latest':selectedFilters.sort?.[0]??'latest',current=Math.max(1,Math.trunc(Number(page))||1);
  if(!sorts.some(([key])=>key===sort))throw parseError('Invalid nhentai.to sort.');
  const selected=[],language=selectedFilters.language?.[0]?.trim();
  if(language&&!languages.some(([key])=>key===language))throw parseError('Invalid nhentai.to language.');
  for(const [key,field] of [['category','category'],...fields.map(([key,field])=>[key,field])]) {
    const value=selectedFilters[key]?.[0]?.trim();if(!value)continue;
    if(value.startsWith('-')||value.includes(','))throw unsupported();selected.push([field,value]);
  }
  const bounds={};
  for(const key of ['min_pages','max_pages']){const raw=selectedFilters[key]?.[0]?.trim();if(raw){if(!/^[1-9]\d{0,5}$/u.test(raw))throw parseError('Invalid nhentai.to page limit.');bounds[key]=Number(raw);}}
  if(bounds.min_pages&&bounds.max_pages&&bounds.min_pages>bounds.max_pages)throw parseError('Invalid nhentai.to page range.');
  const exclude=selectedFilters.exclude?.[0]?.trim();
  if(searchTerm.trim()){
    if(selected.length)throw unsupported();
    // The form accepts only these four values; other languages are silently
    // ignored by the website. Never return an unfiltered result as a match.
    if(language&&!['english','japanese','chinese','korean'].includes(language))throw unsupported();
    return urlWithQuery('/search/',base,{q:searchTerm.trim(),page:current,sort:({latest:'newest',popular:'most-favorited'})[sort]??sort,...(language?{lang:language}:{}),...bounds,...(exclude?{exclude}:{})});
  }
  if(Object.keys(bounds).length||exclude)throw unsupported();
  if(language)selected.push(['language',language]);
  if(selected.length>1||selected.length&&sort!=='latest'||!selected.length&&!['latest','popular'].includes(sort))throw unsupported();
  if(selected.length){const [field,value]=selected[0],slug=normalizeText(value).toLowerCase().replace(/\s+/gu,'-');return urlWithQuery(`/${field}/${encodeURIComponent(slug)}/`,base,{page:current});}
  return urlWithQuery(sort==='popular'?'/popular':'/go',base,{page:current});
}
const tile={href:{selector:'a.cover',attr:'href'},title:{selector:'.caption',text:true},image:picture,languageTags:{attr:'data-tags'}};
const withFlags=rows=>requireArray(rows,'nhentai.to cards').map(row=>({...row,languageFlagData:tagFlagData(row.languageTags)}));
const detailsProjection={fields:{cover:{selector:'#cover img',fields:picture.fields},scripts,related:{selector:'.index-mlt .gallery',all:true,fields:tile}}};
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
  const data=requireRecord(input,'nhentai.to title'),gallery=requireRecord(galleryData(data.scripts),'nhentai.to gallery'),names=record(gallery.title),title=string(names.english??names.pretty??names.japanese);
  if(!title)throw parseError('nhentai.to title is missing.');
  const tags=requireArray(gallery.tags,'nhentai.to tags'),values=type=>tags.filter(tag=>tag.type===type).map(tag=>normalizeText(tag.name)).filter(Boolean),count=Number(gallery.num_pages);
  if(!Number.isInteger(count)||count<1)throw parseError('Invalid nhentai.to page count.');
  const coverUrl=imageUrl(data.cover,base);if(!coverUrl)throw parseError('nhentai.to cover is missing.');
  return {gallery,info:manga({id,title,secondaryTitle:string(names.japanese),coverUrl,languageFlagData:values('language').map(languageFlagData).find(Boolean)??null,pageCount:count,artist:values('artist').join(', ')||null,author:values('group').join(', ')||values('artist').join(', ')||null,
    type:values('category')[0]??null,tags:values('tag'),ageRating:'18+',status:'completed',description:[values('language').join(', '),`Страниц: ${count}`].filter(Boolean).join('\n')}),related:listing(withFlags(data.related),base,'g').filter(row=>row.id!==id)};
}
export function pages(data) {
  const gallery=data.gallery,raw=record(gallery.images).pages;
  const descriptors=Array.isArray(raw)?raw:Object.values(requireRecord(raw,'nhentai.to page descriptors'));
  if(descriptors.length!==data.info.pageCount)throw parseError('Incomplete nhentai.to page descriptors.');
  const cover=new URL(data.info.coverUrl),media=String(gallery.media_id);
  if(!/^\d+$/u.test(media)||!cover.pathname.startsWith(`/galleries/${media}/`))throw parseError('Mismatched nhentai.to media origin.');
  return descriptors.map((row,index)=>{const extension={j:'jpg',p:'png',g:'gif',w:'webp',a:'avif'}[row.t];if(!extension)throw parseError('Unknown nhentai.to page format.');
    const image=new URL(cover.href);image.pathname=`/galleries/${media}/${index+1}.${extension}`;return {index,imageUrl:image.href};});
}
export default ctx=>createGallery(ctx,{prefix:'g',url:catalogUrl,filters:buildFilters,listingProjection:{all:true,fields:tile},items:withFlags,
  selector:(mode,query)=>mode==='latest'||mode==='search'&&!query.searchTerm?.trim()&&!(query.selectedFilters?.sort?.[0]==='popular')&&!Object.entries(query.selectedFilters??{}).some(([key,value])=>key!=='sort'&&value.length)?'.index-latest .gallery':'.index-container .gallery',detailsProjection,details,pages});
