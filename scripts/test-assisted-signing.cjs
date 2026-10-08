const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, process, Date, Buffer, require: name => name in mocks ? mocks[name] : require(name) });
  return module.exports;
}
(async () => {
  let emails = 0, webhooks = 0, created;
  const prisma = { envelope: { create: async ({data}) => { created = data; return { id: 'envelope', ...data }; } }, signer: { create: async ({data}) => ({ id: String(data.order), ...data }) }, field: { createMany: async () => {} } };
  const { createEnvelopeFromTemplate } = load('src/lib/templateEnvelope.ts', {
    '@/lib/prisma': { prisma }, '@/lib/storage': { getObjectBuffer: async () => Buffer.from('pdf'), putObjectBuffer: async () => {} },
    '@/lib/queue': { enqueueSendSigningLink: async () => { emails++; }, enqueueWebhookEvent: async () => { webhooks++; } },
    '@/lib/signingFieldPolicy': { signerCanEditField: () => false },
  });
  const input = { template: { id: 'template', orgId: 'org', name: 'Lease', originalKey: 'original', roles: [{ id: 'customer', order: 1, fields: [] }, { id: 'rep', order: 2, fields: [] }] }, recipients: [{roleId:'customer',name:'Customer',email:'customer@example.invalid'},{roleId:'rep',name:'Rep',email:'rep@example.invalid'}], createdById: 'staff' };
  await createEnvelopeFromTemplate({ ...input, invitationDelivery: 'ASSISTED' });
  assert.equal(emails, 0); assert.equal(webhooks, 1); assert.equal(created.auditEvents.create.metadata.invitationDelivery, 'ASSISTED');
  await createEnvelopeFromTemplate(input); assert.equal(emails, 1); assert.equal(webhooks, 2);
  process.env.APP_URL = 'https://signing.example.invalid';
  let key = {orgId:'org'}, record, query;
  const GET = load('src/app/api/v1/envelopes/[id]/signing-session/route.ts', {
    'next/server': { NextResponse: { json: (data, options = {}) => ({data,status:options.status ?? 200,headers:options.headers}) } },
    '@/lib/apiAuth': { authenticateApiKey: async () => key },
    '@/lib/prisma': { prisma: { envelope: { findFirst: async args => { query = args; return record; } } } },
  }).GET;
  const request = {headers:{get:()=>null}}, params = {params:{id:'envelope'}};
  key = null; assert.equal((await GET(request,params)).status,401);
  key = {orgId:'org'}; record = null; assert.equal((await GET(request,params)).status,404); assert.equal(query.where.orgId,'org'); assert.equal(query.where.deletedAt,null);
  const signers = [{name:'Customer',order:1,status:'PENDING',token:'test-customer',autoSign:false},{name:'Rep',order:2,status:'PENDING',token:'test-rep',autoSign:false}];
  record = {id:'envelope',status:'SENT',signers};
  let response = await GET(request,params); assert.equal(response.headers['cache-control'],'no-store'); assert.ok(response.data.signers[0].signingUrl); assert.equal(response.data.signers[1].signingUrl,null);
  delete process.env.APP_URL; assert.equal((await GET(request,params)).data.signers[0].signingUrl, '/sign/test-customer');
  process.env.APP_URL = 'https://signing.example.invalid';
  signers[0].status = 'SIGNED'; response = await GET(request,params); assert.equal(response.data.signers[0].signingUrl,null); assert.ok(response.data.signers[1].signingUrl);
  signers[1].autoSign = true; assert.equal((await GET(request,params)).data.signers[1].signingUrl,null);
  record.status='COMPLETED'; assert.ok((await GET(request,params)).data.signers.every(s=>!s.signingUrl));
  for (const state of ['VOIDED','EXPIRED','DECLINED']) {record.status=state; assert.equal((await GET(request,params)).status,409);}
  record.status='SENT'; record.expiresAt=new Date(0); assert.equal((await GET(request,params)).status,409);
  console.log('Assisted delivery, default email delivery, webhook continuity, authentication, organisation scope, signer order, auto-sign exclusion, completed and expired/voided sessions passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
