import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createRequestAuth, AuthConfigurationError, safeReturnPath } from '../lib/auth.ts';
import { currentIdentity, runWithIdentity } from '../lib/auth-context.ts';

const origin='https://malapit-auth-test.supabase.co';
const adminId='00000000-1111-4222-8333-000000000001';
const renterId='00000000-1111-4222-8333-000000000002';
const config={AUTH_MODE:'supabase',SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'test-publishable-key',ADMIN_USER_IDS:adminId};
const {privateKey,publicKey}=await generateKeyPair('ES256');
const jwk={...await exportJWK(publicKey),kid:'auth-test-key',alg:'ES256',use:'sig'};
async function token(claims={}, signingKey=privateKey){return new SignJWT({email:'renter@example.com',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'Test Renter'},...claims}).setProtectedHeader({alg:'ES256',kid:'auth-test-key'}).setSubject(claims.sub??renterId).setIssuer(claims.iss??origin+'/auth/v1').setAudience(claims.aud??'authenticated').setIssuedAt().setExpirationTime(claims.exp??'1h').sign(signingKey)}
function request(jwt,extra={},path='/api/data'){
  const headers={...extra};
  if(jwt){const session={access_token:jwt,refresh_token:'test-refresh-value',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:adminId,email:'forged@example.com',app_metadata:{isAdmin:true}}};headers.cookie='sb-malapit-auth-test-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')}
  return new Request('https://malapit.example.workers.dev'+path,{headers});
}
const fetcher=async(input)=>{
  if(String(input).endsWith('/.well-known/jwks.json'))return Response.json({keys:[jwk]});
  return Response.json({message:'Invalid session',code:'bad_jwt'},{status:401});
};
test('public browsing and forged host identity headers never create a user',async()=>{
  const req=request(null,{'oai-authenticated-user-id':adminId,'oai-authenticated-user-email':'owner@example.com','cf-access-jwt-assertion':'made-up',cookie:'__malapit_local_auth=1; CF_Authorization=made-up'});
  assert.equal(await createRequestAuth(req,config,fetcher).identity(),null);
  const pending=createRequestAuth(request(null),{AUTH_MODE:'supabase'});assert.equal(pending.ready,false);assert.equal(await pending.identity(),null);
});
test('Supabase JWT signature and claims are verified instead of trusting the cookie user object',async()=>{
  const user=await createRequestAuth(request(await token()),config,fetcher).identity();
  assert.equal(user.userId,renterId);assert.equal(user.displayName,'Test Renter');assert.equal(user.isAdmin,false);
  const other=await generateKeyPair('ES256');
  assert.equal(await createRequestAuth(request(await token({},other.privateKey)),config,fetcher).identity(),null);
  for(const claims of [{iss:'https://other.supabase.co/auth/v1'},{aud:'another-app'},{role:'anon'},{app_metadata:{provider:'email'}},{is_anonymous:true},{email:undefined},{exp:1}])assert.equal(await createRequestAuth(request(await token(claims)),config,fetcher).identity(),null);
});
test('only configured signed user IDs become administrators; email and editable metadata cannot grant it',async()=>{
  assert.equal((await createRequestAuth(request(await token({email:'owner@example.com',user_metadata:{isAdmin:true,role:'admin'}})),config,fetcher).identity()).isAdmin,false);
  assert.equal((await createRequestAuth(request(await token({sub:adminId})),config,fetcher).identity()).isAdmin,true);
  assert.equal((await createRequestAuth(request(await token({sub:adminId})),{...config,ADMIN_USER_IDS:''},fetcher).identity()).isAdmin,false);
});
test('Google sign-in uses PKCE, a safe callback, and secure HttpOnly cookies',async()=>{
  const auth=createRequestAuth(request(null,{},'/auth/signin'),config,fetcher);
  const destination=new URL(await auth.signIn('/?view=saved'));
  assert.equal(destination.origin,origin);assert.equal(destination.searchParams.get('provider'),'google');assert.equal(destination.searchParams.get('code_challenge_method'),'s256');
  const callback=new URL(destination.searchParams.get('redirect_to'));assert.equal(callback.origin,'https://malapit.example.workers.dev');assert.equal(callback.pathname,'/auth/callback');assert.equal(callback.searchParams.get('return_to'),'/?view=saved');
  const response=auth.response(Response.redirect(destination));const cookies=response.headers.getSetCookie();assert(cookies.length);for(const cookie of cookies){assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Lax/i);assert(!cookie.includes('Domain='))}
  assert.match(response.headers.get('cache-control'),/no-store/);
});
test('code exchange requires the matching browser verifier and forwards session cookies',async()=>{
  const start=createRequestAuth(request(null,{},'/auth/signin'),config,fetcher);const destination=new URL(await start.signIn('/'));
  const cookies=start.response(new Response(null)).headers.getSetCookie().map(cookie=>cookie.split(';')[0]).join('; ');
  const jwt=await token();
  const exchange=async(input,init)=>{
    if(!String(input).includes('/token'))return fetcher(input,init);
    const body=JSON.parse(init.body);const verifier=body.code_verifier;
    const challenge=verifier?Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url'):'';
    if(body.auth_code!=='valid-code'||challenge!==destination.searchParams.get('code_challenge'))return Response.json({message:'PKCE validation failed',code:'bad_code_verifier'},{status:400});
    return Response.json({access_token:jwt,refresh_token:'test-refresh-value',expires_in:3600,token_type:'bearer',user:{id:renterId,email:'renter@example.com',app_metadata:{provider:'google'}}});
  };
  const valid=createRequestAuth(request(null,{cookie:cookies},'/auth/callback'),config,exchange);assert.equal(await valid.callback('valid-code'),true);assert(valid.response(new Response(null)).headers.getSetCookie().some(cookie=>cookie.includes('-auth-token=')));
  assert.equal(await createRequestAuth(request(null,{},'/auth/callback'),config,exchange).callback('valid-code'),false);
});
test('sign-out clears the browser cookies even if the remote sign-out fails',async()=>{
  const auth=createRequestAuth(request(await token()),config,fetcher);await auth.signOut();const response=auth.response(new Response(null));assert(response.headers.getSetCookie().some(cookie=>cookie.includes('Max-Age=0')));assert.match(response.headers.get('cache-control'),/no-store/);
});
test('local fixtures need explicit local mode on loopback HTTP',async()=>{
  const local={AUTH_MODE:'local',ADMIN_USER_IDS:'local_seedy'};
  const req=new Request('http://127.0.0.1:5188/api/data',{headers:{'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'local_seedy@sites.test'}});
  assert.equal((await createRequestAuth(req,local).identity()).isAdmin,true);
  for(const url of ['https://malapit.example.workers.dev/','http://public.example/','https://localhost/'])assert.throws(()=>createRequestAuth(new Request(url),local),AuthConfigurationError);
  assert.throws(()=>createRequestAuth(request(null),{AUTH_MODE:'access'}),AuthConfigurationError);
});
test('identities are isolated across concurrent requests',async()=>{
  await Promise.all(['a','b'].map(userId=>runWithIdentity({userId},async()=>{await new Promise(resolve=>setTimeout(resolve,1));assert.equal(currentIdentity().userId,userId)})));assert.equal(currentIdentity(),null);
});
test('auth redirects reject external and reserved destinations',()=>{
  assert.equal(safeReturnPath('/?view=saved'),'/?view=saved');for(const value of [null,'//evil.test','/\\evil.test','https://evil.test','/auth/signout','/cdn-cgi/access/logout'])assert.equal(safeReturnPath(value),'/');
});
