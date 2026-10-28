import createGallery,{fields,galleryFilters,imageUrl,languages,listing,picture,scripts} from '../core/gallery.mjs';
import {manga,normalizeText,parseError} from '../core/data.mjs';
import {requireArray,requireRecord,urlWithQuery} from '../core/http.mjs';

const sorts=[['latest','Последние'],['popular','Популярные']];
export function catalogUrl(base,{page=1,searchTerm='',selectedFilters={}}={},mode='search') {
  const sort=mode==='popular'?'popular':mode==='latest'?'latest':selectedFilters.sort?.[0]??'latest';
  if(!sorts.some(([key])=>key===sort))throw parseError('Invalid 3Hentai sort.');
  const terms=[searchTerm.trim()],language=selectedFilters.language?.[0],category=selectedFilters.category?.[0];
  if(language){if(!languages.some(([key])=>key===language))throw parseError('Invalid 3Hentai language.');terms.push(`language:${language}`);}
  if(category)terms.push(`category:${quote(category)}`);
  for(const [key,field] of fields)for(const raw of (selectedFilters[key]?.[0]??'').split(',').map(v=>v.trim()).filter(Boolean)) {
    const excluded=raw.startsWith('-'),value=excluded?raw.slice(1).trim():raw;if(value)terms.push(`${excluded?'-':''}${field}:${quote(value)}`);
  }
  const q=terms.filter(Boolean).join(' '),current=Math.max(1,Math.trunc(Number(page))||1);
  if(!q){if(sort!=='latest'&&current>1)return null;return new URL(current>1?`/${current}`:'/',base).href;}
  return urlWithQuery('/search',base,{q,page:current,...(sort!=='latest'?{sort}:{})});
}
const quote=value=>`"${value.replace(/["\\]/gu,' ').replace(/\s+/gu,' ').trim()}"`;
const tile={href:{selector:'a.cover',attr:'href'},title:{selector:'.title',text:true},image:picture};
const detailsProjection={fields:{title:{selector:'h1',text:true},cover:{selector:'.main-cover img',fields:picture.fields},
  links:{selector:'.tag-container a.name',all:true,fields:{href:{attr:'href'},text:{text:true}}},rows:{selector:'.tag-container',all:true,text:true},
  count:{selector:'.single-thumb',all:true,fields:{href:{selector:'a',attr:'href'}}},related:{selector:'.doujin',all:true,fields:tile}}};
export function details(input,id,base) {
  const data=requireRecord(input,'3Hentai title'),title=normalizeText(data.title);if(!title)throw parseError('3Hentai title is missing.');
  const values=path=>requireArray(data.links,'3Hentai metadata').filter(row=>new URL(row.href,base).pathname.startsWith(`/${path}/`)).map(row=>normalizeText(row.text)).filter(Boolean);
  const count=requireArray(data.count,'3Hentai page thumbnails').length;if(!count)throw parseError('3Hentai page count is missing.');
  const tags=values('tags'),type=values('category')[0]??null,language=values('language');
  return {info:manga({id,title,coverUrl:imageUrl(data.cover,base),tags,type,pageCount:count,status:'completed',ageRating:'18+',
    author:values('groups').join(', ')||null,artist:values('artists').join(', ')||null,description:[type,language.join(', '),`Страниц: ${count}`].filter(Boolean).join('\n')}),related:listing(data.related,base,'d').filter(row=>row.id!==id)};
}
function decodeBase64(value) {
  if(!/^[A-Za-z0-9+/]+={0,2}$/u.test(value)||value.length%4)throw parseError('Invalid 3Hentai reader encoding.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',bytes=[];let buffer=0,bits=0;
  for(const char of value.replace(/=+$/u,'')){buffer=(buffer<<6)|alphabet.indexOf(char);bits+=6;if(bits>=8){bits-=8;bytes.push((buffer>>bits)&255);}}
  return new TextDecoder().decode(new Uint8Array(bytes));
}
export function pages(input,id,base='https://3hentai.net') {
  const match=requireArray(input,'3Hentai reader scripts').map(String).join('\n').match(/\breaderPages\s*=\s*JSON\.parse\(atob\(["']([A-Za-z0-9+/=]+)["']\)\)/u);
  let data;try{data=match?JSON.parse(decodeBase64(match[1])):null;}catch{throw parseError('Invalid 3Hentai reader data.');}
  data=requireRecord(data,'3Hentai page map');const rows=Object.entries(requireRecord(data.pages,'3Hentai pages')).sort(([a],[b])=>Number(a)-Number(b));
  if(!rows.length||rows.length!==Number(data.lastPage)||!new URL(data.baseUri).pathname.startsWith(`/d/${id}/`))throw parseError('Incomplete or mismatched 3Hentai reader.');
  return rows.map(([key,row],index)=>{
    if(Number(key)!==index+1||!/^\d+\.(?:jpg|jpeg|png|webp|gif|avif)$/u.test(row.f??''))throw parseError('Invalid 3Hentai page.');
    const imageUrl=new URL(String(data.baseUriImg).replace('%s',row.f));
    const mirror=new URL(base).hostname;
    if(imageUrl.protocol!=='https:'||!/(?:^|\.)3hentai\.net$/u.test(imageUrl.hostname)&&imageUrl.hostname!==mirror&&!imageUrl.hostname.endsWith(`.${mirror}`))throw parseError('Invalid 3Hentai image origin.');
    return {index,imageUrl:imageUrl.href};
  });
}
export function selectListing(groups,mode,query={}) {
  const popular=mode==='popular'||mode==='search'&&!query.searchTerm?.trim()&&!Object.entries(query.selectedFilters??{}).some(([key,value])=>key!=='sort'&&value.length)&&query.selectedFilters?.sort?.[0]==='popular';
  return requireArray(groups,'3Hentai catalog groups').filter(group=>String(group.class??'').split(/\s+/u).includes('text-center')===popular).flatMap(group=>requireArray(group.items,'3Hentai catalog group'));
}
export default ctx=>createGallery(ctx,{prefix:'d',path:id=>`/d/${id}`,readerPath:id=>`/d/${id}/1`,url:catalogUrl,filters:()=>galleryFilters(sorts),
  listingProjection:{all:true,fields:{class:{attr:'class'},items:{selector:'.doujin',all:true,fields:tile}}},items:selectListing,selector:()=>'.listing-container',
  detailsProjection,details,readerProjection:scripts,pages});
