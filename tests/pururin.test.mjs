import test from 'node:test';
import assert from 'node:assert/strict';
import createPururin,{buildFilters,pageRange,normalizePath,parseListing,parseDetails} from '../src/sources/pururin.mjs';
test('Pururin selectable taxonomy IDs are unique and legacy page-range conventions stay stable', () => {
  const filters = buildFilters(), types = filters.find(item => item.key === 'types'); assert.equal(filters.length,13);
  assert.equal(new Set(types.options.map(item => item.value)).size,types.options.length);
  for (const [input,expected] of [['',[1,9999]],['<20',[1,21]],['<=40',[1,40]],['>20',[21,9999]],['>=20',[20,9999]],['25',[25,25]],['=>2',[2,9999]],['99999',[9999,9999]]]) assert.deepEqual(pageRange(input),expected);
  assert.equal(normalizePath('https://pururin.me/gallery/a?q=1'),'/gallery/a/');
});
test('Pururin cards deduplicate stable paths and details exclude content/ratings description rows', () => {
  assert.equal(parseListing([{href:'/gallery/a',title:'A',image:{lazy:'/a.jpg'}},{href:'/gallery/a/',title:'B'}]).length,1);
  const details = parseDetails({title:'A',authors:['Group'],artists:[],tags:['Tag'],rows:[{cells:['Content','Tag'],links:['Tag']},{cells:['Pages','2'],links:[]}]},'/gallery/a');
  assert.equal(details.id,'/gallery/a/'); assert.equal(details.author,'Group'); assert.equal(details.artist,'Group'); assert.equal(details.description,'Pages: 2');
});
test('Pururin tag resolution uses own form POST and retains included/excluded JSON values', async () => {
  const calls = []; const source = createPururin({http:{request:async input => {calls.push(input); return {body:input.method === 'POST' ? '[{"id":10,"name":"sample"}]' : 'html'};}},html:{extract:async () => []}});
  await source.search({searchTerm:'name',selectedFilters:{tags:['sample, -sample'],types:['13004']}});
  assert.equal(calls[0].body,'text=sample'); assert.equal(calls[0].headers.Referer,'https://pururin.me/tags/content/');
  const query = new URL(calls.at(-1).url).searchParams;
  assert.deepEqual(JSON.parse(query.get('included_tags')),[{id:10,name:'sample'}]);
  assert.ok(JSON.parse(query.get('excluded_tags')).some(value => value.id === 10));
});

test('Pururin coalesces repeated lookups, resolves at most three at once and reuses IDs on page two', async () => {
  const gates=new Map(), posts=[], listings=[];
  const source=createPururin({http:{request:async input=>{
    if(input.method!=='POST'){listings.push(new URL(input.url));return {body:'html'};}
    const text=new URLSearchParams(input.body).get('text');posts.push(text);
    await new Promise(resolve=>gates.set(text,resolve));
    return {body:JSON.stringify([{id:text.charCodeAt(0),name:text}])};
  }},html:{extract:async()=>[]}});
  const query={searchTerm:'title',selectedFilters:{tags:['a,b,c,d,-a']}};
  const pending=source.search(query);
  await new Promise(setImmediate);assert.deepEqual(posts,['a','b','c']);
  gates.get('c')();await new Promise(setImmediate);assert.deepEqual(posts,['a','b','c','d']);
  gates.get('d')();gates.get('b')();gates.get('a')();await pending;
  await source.search({...query,page:2});assert.equal(posts.length,4);assert.equal(listings.length,2);
  assert.deepEqual(JSON.parse(listings[0].searchParams.get('included_tags')).map(x=>x.name),['a','b','c','d']);
  assert.deepEqual(JSON.parse(listings[0].searchParams.get('excluded_tags')).map(x=>x.name),['a']);
  assert.equal(listings[1].searchParams.get('page'),'2');
});

test('Pururin does not cache failed taxonomy reads and separates taxonomies', async () => {
  let calls=0;
  const source=createPururin({http:{request:async input=>{
    if(input.method!=='POST')return {body:'html'};
    calls++;if(calls===1)throw Object.assign(Error('offline'),{code:'network'});
    return {body:'[{"id":1,"name":"a"}]'};
  }},html:{extract:async()=>[]}});
  const query={searchTerm:'title',selectedFilters:{tags:['a']}};
  await assert.rejects(source.search(query),{code:'network'});
  await source.search(query);await source.search({...query,selectedFilters:{tags:['a'],artists:['a']}});
  assert.equal(calls,3);
});

test('empty or malformed taxonomy replies are retried rather than negative-cached', async () => {
  for(const invalid of ['', '{}']) {
    let calls=0;
    const source=createPururin({http:{request:async input=>({body:input.method==='POST' ? (++calls===1 ? invalid : '[]') : 'html'})},html:{extract:async()=>[]}});
    const query={searchTerm:'title',selectedFilters:{tags:['a']}};
    await assert.rejects(source.search(query));await source.search(query);assert.equal(calls,2);
  }
});
