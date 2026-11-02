import {parseError} from './data.mjs';

export function requireHtmlBody(response,source) {
  if(typeof response?.body!=='string'||!response.body.trim())throw Object.assign(Error(`Empty ${source} response.`),{code:'invalid_response',phase:'http'});
  // Cloudflare can serve a challenge with HTTP 200. Match its page title or
  // response header, not incidental challenge-platform scripts on real pages.
  if(response.headers?.['cf-mitigated']==='challenge'||/<title[^>]*>\s*(?:(?:Just a moment|Один момент)[.!…\s]*|Attention Required!?(?:\s*\|\s*Cloudflare)?)\s*<\/title>/iu.test(response.body)) {
    throw Object.assign(Error(`${source} browser verification is required.`),{code:'challenge_required',phase:'http'});
  }
  return response.body;
}

export function urlWithQuery(path, base, query = {}) {
  const url = new URL(path, base);
  for (const [key, raw] of Object.entries(query)) {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value !== null && value !== undefined) url.searchParams.append(key, String(value));
    }
  }
  return url.href;
}

export function requireRecord(value, field = 'response') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw parseError(`Invalid ${field} object.`);
  return value;
}

export function requireArray(value, field = 'data') {
  if (!Array.isArray(value)) throw parseError(`Invalid ${field} list.`);
  return value;
}

export function requireText(value, field = 'value') {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!text) throw parseError(`Missing ${field}.`);
  return text;
}

export function finiteNumber(value, fallback = 0) {
  const result = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(result) ? result : fallback;
}
