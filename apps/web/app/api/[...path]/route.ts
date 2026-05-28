import { NextResponse, type NextRequest } from 'next/server';
import { getDevUserEmail } from '@/lib/auth-cookie';
import { API_BASE_URL } from '@/lib/api-base-url';

/**
 * Same-origin proxy from the Next app (port 3000) to the NestJS API (port 4000).
 *
 * Why: lets client components fetch from `/api/...` without CORS, without exposing
 * the API URL to the browser, and with the dev-user-email cookie automatically
 * forwarded as the `X-Dev-User-Email` header the API guard expects.
 *
 * Production path: when MSAL JWT auth lands, this route forwards the Bearer token
 * from the user's session instead of the dev header. The contract on the API stays
 * the same.
 */

async function forward(req: NextRequest, params: Promise<{ path: string[] }>): Promise<Response> {
  const { path } = await params;
  const targetPath = path.map(encodeURIComponent).join('/');
  const search = req.nextUrl.search;
  const targetUrl = `${API_BASE_URL}/api/${targetPath}${search}`;

  const headers = new Headers();
  // Pass through caller's content-type and accept; everything else (cookie etc.) is intentionally dropped.
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const accept = req.headers.get('accept');
  if (accept) headers.set('accept', accept);

  // Dev auth: forward the chosen user as a header. In prod this becomes a Bearer JWT.
  const email = await getDevUserEmail();
  if (email) headers.set('x-dev-user-email', email);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };
  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const buf = await upstream.arrayBuffer();

  const respHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    // Strip hop-by-hop / chunked encoding headers that conflict with NextResponse buffering.
    if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(k.toLowerCase())) {
      respHeaders.set(k, v);
    }
  });
  return new NextResponse(buf, { status: upstream.status, headers: respHeaders });
}

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
