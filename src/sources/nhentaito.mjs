import createGallery,{fields,galleryFilters,imageUrl,languages,listing,picture,scripts} from '../core/gallery.mjs';
import {manga,normalizeText,parseError,record,string} from '../core/data.mjs';
import {requireArray,requireRecord,urlWithQuery} from '../core/http.mjs';

const sorts=[['latest','Последние'],['popular','Популярные']];
const unsupported=()=>Object.assign(Error('nhentai.to supports one taxonomy page or title search; it does not combine those conditions or sort them by popularity.'),{code:'unsupported',phase:'filters'});
export function catalogUrl(base,{page=1,searchTerm='',selectedFilters={}}={},mode='search') {
  const sort=mode==='popular'?'popular':mode==='latest'?'latest':selectedFilters.sort?.[0]??'latest',current=Math.max(1,Math.trunc(Number(page))||1);
  if(!sorts.some(([key])=>key===sort))throw parseError('Invalid nhentai.to sort.');
  const selected=[];
  for(const [key,field] of [['language','language'],['category','category'],...fields.map(([key,field])=>[key,field])]) {
    const value=selectedFilters[key]?.[0]?.trim();if(!value)continue;
    if(key==='language'&&!languages.some(([key])=>key===value))throw parseError('Invalid nhentai.to language.');
    if(value.startsWith('-')||value.includes(','))throw unsupported();selected.push([field,value]);
  }
  if(selected.length>1||selected.length&&(searchTerm.trim()||sort!=='latest')||searchTerm.trim()&&sort!=='latest')throw unsupported();
  if(selected.length){const [field,value]=selected[0],slug=normalizeText(value).toLowerCase().replace(/\s+/gu,'-');return urlWithQuery(`/${field}/${encodeURIComponent(slug)}/`,base,{page:current});}
  if(searchTerm.trim())return urlWithQuery('/search/',base,{q:searchTerm.trim(),page:current});
  return urlWithQuery(sort==='popular'?'/popular':'/go',base,{page:current});
}
const tile={href:{selector:'a.cover',attr:'href'},title:{selector:'.caption',text:true},image:picture};
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
  return {gallery,info:manga({id,title,secondaryTitle:string(names.japanese),coverUrl,pageCount:count,artist:values('artist').join(', ')||null,author:values('group').join(', ')||values('artist').join(', ')||null,
    type:values('category')[0]??null,tags:values('tag'),ageRating:'18+',status:'completed',description:[values('language').join(', '),`Страниц: ${count}`].filter(Boolean).join('\n')}),related:listing(data.related,base,'g').filter(row=>row.id!==id)};
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
export default ctx=>createGallery(ctx,{prefix:'g',url:catalogUrl,filters:()=>galleryFilters(sorts,{limited:true}),listingProjection:{all:true,fields:tile},
  selector:(mode,query)=>mode==='latest'||mode==='search'&&!query.searchTerm?.trim()&&!(query.selectedFilters?.sort?.[0]==='popular')&&!Object.entries(query.selectedFilters??{}).some(([key,value])=>key!=='sort'&&value.length)?'.index-latest .gallery':'.index-container .gallery',detailsProjection,details,pages});
