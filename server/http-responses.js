import { assertApiErrorResponse, assertApiResponse } from '../shared/api-contracts.js';

export const jsonHeaders = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});

export function jsonResponse(data, status = 200, extraHeaders = {}, contract) {
  if (status >= 400) {
    assertApiErrorResponse(data);
  } else {
    if (!contract) throw new TypeError('成功 JSON 响应必须声明 API 契约');
    assertApiResponse(contract, data);
  }

  return Response.json(data, { status, headers: { ...jsonHeaders, ...extraHeaders } });
}
