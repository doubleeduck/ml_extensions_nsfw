import createLibGroup from './engines/libgroup.mjs';
import createGrouple from './engines/grouple.mjs';
import createSenkuro from './engines/senkuro.mjs';
import createIMHentai from './sources/imhentai.mjs';
import createPururin from './sources/pururin.mjs';
import createChan from './engines/chan.mjs';
import createNudeMoon from './sources/nudemoon.mjs';

const factories = new Map([
  ['ru.nsfw.hentailib',createLibGroup],
  ['ru.nsfw.yaoilib',createLibGroup],
  ['ru.nsfw.allhentai',createGrouple],
  ['ru.nsfw.senkognito',createSenkuro],
  ['all.nsfw.imhentai',createIMHentai],
  ['en.nsfw.imhentai',createIMHentai],
  ['ru.nsfw.imhentai',createIMHentai],
  ['all.nsfw.pururin',createPururin],
  ['ru.nsfw.hchan',createChan],
  ['ru.nsfw.nudemoon',createNudeMoon],
]);
export default function createSource(context) {
  const factory = factories.get(context.sourceId);
  if (!factory) throw Object.assign(Error('Source ID is not registered in this package.'),{code:'source_unavailable',phase:'factory'});
  return factory(context);
}
