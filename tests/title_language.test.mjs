import test from 'node:test';
import assert from 'node:assert/strict';
import {titleLanguageCode} from '../src/core/data.mjs';

test('page language is explicit, normalized, and unknown for mixed editions', () => {
  assert.equal(titleLanguageCode(['Japanese']), 'ja');
  assert.equal(titleLanguageCode(['jp', 'Japanese']), 'ja');
  assert.equal(titleLanguageCode(['English', 'translated']), 'en');
  assert.equal(titleLanguageCode(['ja', 'en']), null);
  assert.equal(titleLanguageCode(['translated']), null);
  assert.equal(titleLanguageCode([]), null);
  assert.equal(titleLanguageCode(['zh-hant']), 'zh-hant');
  assert.equal(titleLanguageCode(['Indonesian']), 'id');
});
