/** Signed, declarative registrations. IDs are the existing persistent app IDs. */
const browse = ['browse','latest','search','filters'];
const origin = host => `https://${host}`;
const sourceBranding = {
  "threehentai": {"icon":"assets/source_logos/threehentai.png","accentColor":"#F15A70"},
  "nhentaito": {"icon":"assets/source_logos/nhentaito.png","accentColor":"#ED2553"},
  "hentailib": {
    "icon": "assets/source_logos/hentailib.png",
    "accentColor": "#E26C7A"
  },
  "yaoilib": {
    "icon": "assets/source_logos/yaoilib.png",
    "accentColor": "#CF6AA8"
  },
  "allhentai": {
    "icon": "assets/source_logos/allhentai.png",
    "accentColor": "#E45A6B"
  },
  "senkognito": {
    "icon": "assets/source_logos/senkognito.png",
    "accentColor": "#DA5A7D"
  },
  "imhentai": {
    "icon": "assets/source_logos/imhentai.png",
    "accentColor": "#ED5D96"
  },
  "pururin": {
    "icon": "assets/source_logos/pururin.png",
    "accentColor": "#EE668F"
  },
  "hchan": {
    "icon": "assets/source_logos/hchan.png",
    "accentColor": "#669922"
  },
  "nudemoon": {
    "icon": "assets/source_logos/nudemoon.jpg",
    "accentColor": "#D71818"
  }
};
function source(id,name,host,module,extra = {}) {
  const base = origin(host), {origins = [],images = [],auth = null,recommendations = false,custom = false,refresh = false,
    template = '/{id}',encoding = 'pathSegment',idPart,capabilities = browse,parameters = {},settings,metadataOnly = false,bindings = {},nsfw = false,media = {},network = {}} = extra;
  return {id,name,language:id.split('.')[0],baseUrl:base,engine:extra.engine ?? 'Handwritten JS',status:'experimental',isNsfw:nsfw,
    branding:sourceBranding[id.split('.').at(-1)],
    supportsCustomBaseUrl:custom,supportsFilterRefresh:refresh,capabilities:[...capabilities,...(recommendations ? ['recommendations'] : []),...(auth ? ['account'] : [])],
    features:{webLinks:true,auth:auth != null,authCompletion:auth?.completionUrl != null,recommendations},
    web:{mangaUrlTemplate:template,idEncoding:encoding,...(idPart ? {idPart} : {})},parameters,
    filterBindings:bindings,metadataOnly,...(extra.presentation ? {presentation:extra.presentation} : {}),...(settings ? {settings} : {}),...(auth ? {auth} : {}),
    network:{origins:[base,...origins].filter((value,index,all) => all.indexOf(value) === index),imageOrigins:[base,...images].filter((value,index,all) => all.indexOf(value) === index),
      authOrigins:auth?.cookieOrigins ?? [base],allowSubdomains:true,methods:['GET','POST','HEAD'],maxConcurrentRequests:6,...network},
    media:{userAgentProfile:'browser',refererOrigin:base,sendOrigin:false,...media},
    // Build-only dispatcher mapping; not a source-manifest property.
    _module:module};
}
const cookieAuth = (host,login = '/login/') => ({profileId:'host.cookie.v1',loginUrl:new URL(login,origin(host)).href,
  cookieOrigins:[origin(host)],sessionExport:{headers:['Cookie'],values:[]}});
const libApis = ['api.cdnlibs.org','api2.mangalib.me','hapi.hentaicdn.org','api.imglib.info'].map(origin);
// Cookie Domain roots are explicit grants, not shared cookie jars. Every
// instance still receives only the browser/HTTP session belonging to its ID.
const libCookieRoots = ['cdnlibs.org','mangalib.me','hentaicdn.org','imglib.info'].map(origin);
const libImages = ['mixlib.me','imglib.info','mangalib.me','hentaicdn.org','cdnlib.org','cdnlibs.org','mangalib.org','mangalib.net'].map(origin);
const enumSetting = (key,label,options,value) => ({key,label,type:'enum',default:value,options:options.map(([value,label]) => ({value,label}))});
const titleLanguage = enumSetting('titleLanguage','Язык названия',[['eng','Английский'],['rus','Русский']],'eng');
const libSettings = {version:1,legacyNamespace:'libgroup',roles:{titleLanguage:'titleLanguage'},fields:[titleLanguage,
  enumSetting('chapterMode','Ветки перевода',[['ms_mixing','Основная'],['ms_combining','Все ветки']],'ms_mixing'),
  {key:'showAlternativeBranchSource',label:'Показывать загрузившего, если нет команды',type:'boolean',default:false},
  enumSetting('imageServer','Сервер изображений',[['auto','Автоматически'],['main','Основной'],['secondary','Дополнительный'],['compress','Сжатые изображения']],'compress'),
  enumSetting('apiDomain','API сервер',libApis.map(url => [url,new URL(url).host]),'https://api2.mangalib.me')]};
const libgroup = (id,name,host,siteId,nsfw = false) => source(id,name,host,'engines/libgroup.mjs',{engine:'LibGroup JS',nsfw,refresh:true,recommendations:true,
  parameters:{siteId:String(siteId)},settings:libSettings,origins:libApis,images:libImages,
  auth:{...cookieAuth(host,'/ru'),profileId:'host.session.v1',rules:{bearer:true,cookieAll:['XSRF-TOKEN','mangalib_session','remember_web_*'],tokenStorageKeys:['auth'],tokenPath:['token','access_token'],tokenTypePath:['token','token_type'],tokenType:'bearer'},cookieOrigins:[...new Set([origin(host),...libApis,...libCookieRoots])],sessionExport:{headers:['Cookie','Authorization','X-XSRF-TOKEN'],values:['accessToken','csrfToken']}},
  template:'/ru/manga/{id}',bindings:{author:'authors',artist:'artists',tags:'tags'},media:{sendOrigin:true}});
const groupleCookieRoots = {'a.zazaza.me':'zazaza.me','1.seimanga.me':'seimanga.me','1.selfmanga.live':'selfmanga.live','20.allhen.online':'allhen.online'};
const grouple = (id,name,host,nsfw = false) => {
  const allhentai = id === 'ru.nsfw.allhentai';
  const authOrigin = allhentai ? 'https://z.qawa.org' : 'https://3.grouple.co';
  const loginUrl = allhentai ? origin(host) : `${authOrigin}/internal/auth/login`;
  return source(id,name,host,'engines/grouple.mjs',{engine:'GroupLe JS',nsfw,custom:true,refresh:true,recommendations:true,
  template:'/{id}',encoding:'path',settings:{version:1,legacyNamespace:'libgroup',roles:{titleLanguage:'titleLanguage'},fields:[titleLanguage]},
  auth:{...cookieAuth(host),profileId:'host.session.v1',rules:{cookieAll:['remember_me'],tokenStorageKeys:['gwt']},loginUrl,cookieOrigins:[origin(host),...(groupleCookieRoots[host] ? [origin(groupleCookieRoots[host])] : []),authOrigin,allhentai ? 'https://qawa.org' : 'https://grouple.co'],completionUrl:origin(host),successUrl:`${authOrigin}/`,sessionExport:{headers:['Cookie'],values:[]}},
  origins:[authOrigin],images:['https://one-way.work','https://manga1.ru','https://manga2.ru','https://manga3.ru','https://mangap.ru','https://mangapoisk.org','https://readmanga.io',...(allhentai ? ['https://aaa200.one','https://aaa200.rocks'] : [])],media:{sendOrigin:true}});
};
const imhentai = language => source(`${language}.nsfw.imhentai`,'IMHentai','imhentai.xxx','sources/imhentai.mjs',{nsfw:true,custom:true,recommendations:true,auth:cookieAuth('imhentai.xxx'),
  template:'/gallery/{id}/',images:['https://imhentai.xxx','https://imhentai.me','https://imhentai.com'],bindings:{author:'groups',artist:'artists',tags:'tags'}});
const senkuro = () => {
  const host = 'senkognito.com', api = 'api.senkognito.com';
  return source('ru.nsfw.senkognito','Senkognito',host,'engines/senkuro.mjs',{engine:'Senkuro GraphQL JS',nsfw:true,refresh:true,recommendations:true,
    capabilities:['browse','latest','search','filters'],origins:[origin(api)],images:['https://senkuro.me','https://senkuro.com','https://senkognito.com','https://senkuro.net'],
    auth:{...cookieAuth(host,'/'),profileId:'host.session.v1',rules:{bearer:true,tokenStorageKeys:['auth','token','accessToken','access_token'],tokenFields:['access_token','accessToken','token','jwt']},cookieOrigins:[origin(host),origin(api)],sessionExport:{headers:['Cookie','Authorization'],values:['accessToken']}},
    template:'/manga/{id}',idPart:{separator:',,',index:1}});
};
export const registrations = [
  source('all.nsfw.threehentai','3Hentai','3hentai.net','sources/threehentai.mjs',{nsfw:true,custom:true,recommendations:true,template:'/d/{id}',
    auth:{...cookieAuth('3hentai.net','/login'),cookieOrigins:['3hentai.net','ru.3hentai.net','es.3hentai.net','fr.3hentai.net','it.3hentai.net','pt.3hentai.net'].map(origin)},
    bindings:{tags:'tags',artist:'artists',author:'groups'},network:{transportProfile:'host.platform.v1'}}),
  source('all.nsfw.nhentaito','nhentai.to','nhentai.to','sources/nhentaito.mjs',{nsfw:true,custom:true,recommendations:true,template:'/g/{id}/',
    auth:cookieAuth('nhentai.to','/login/'),images:['https://supercdn.site','https://t.nhentai.net','https://i.nhentai.net'],bindings:{tags:'tags',artist:'artists',author:'groups'},network:{transportProfile:'host.platform.v1'}}),
  libgroup('ru.nsfw.hentailib','HentaiLib','hentailib.me',4,true),libgroup('ru.nsfw.yaoilib','YaoiLib','v2.shlib.life',2,true),
  grouple('ru.nsfw.allhentai','AllHentai','20.allhen.online',true),
  senkuro(),...['all','en','ru'].map(imhentai),
  source('all.nsfw.pururin','Pururin','pururin.me','sources/pururin.mjs',{nsfw:true,template:'/{id}',encoding:'path',images:['https://pururin.me'],bindings:{author:'circles',artist:'artists',tags:'tags'}}),
  source('ru.nsfw.hchan','H-chan','x2.h-chan.me','engines/chan.mjs',{nsfw:true,custom:true,recommendations:true,capabilities:['latest','search','filters'],template:'/{id}',encoding:'path',images:['https://h-chan.me'],bindings:{tags:'tags'},presentation:{coverFit:'contain'}}),
  source('ru.nsfw.nudemoon','Nude Moon','nude-moon.org','sources/nudemoon.mjs',{nsfw:true,refresh:true,bindings:{tags:'tags'},auth:cookieAuth('nude-moon.org','/'),template:'/{id}-manga.html',network:{transportProfile:'host.platform.v1'}}),
];
export function sourceDefinitions() { return registrations.map(({_module,...definition}) => definition); }
export function manifestDefinition({version,publisherKeyId}) {
  return {schemaVersion:1,extensionId:'official.mangalaunch.nsfw.sources',name:'MangaLaunch Unofficial NSFW Extensions',version,publisherKeyId,
    icon:'assets/icon.png',sourceApiVersion:1,minAppVersion:'1.0.0',minRuntimeAbi:1,entrypoint:'src/index.mjs',license:'LicenseRef-Proprietary',permissions:['http','html','sourceSettings','sourceSession'],sources:sourceDefinitions(),files:{}};
}
