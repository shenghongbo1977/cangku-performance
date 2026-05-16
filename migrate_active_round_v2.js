/**
 * migrate_active_round_v2.js
 * =========================================
 * 绩效考评系统 v1.2.0 数据库迁移脚本
 *
 * 功能：为 rounds 表添加 is_active 字段，并迁移原 active_round_id 数据
 * 运行：node migrate_active_round_v2.js
 * 依赖：Node.js 18+（原生 https 模块，无需安装第三方包）
 *
 * 注意：ALTER TABLE 需要在 Supabase SQL Editor 中手动执行，
 *       本脚本仅负责数据迁移验证。
 */

'use strict';

const https = require('https');

// ============ 配置 ============
const SUPABASE_URL = 'https://ehdzdwiynbzbcaqmppkv.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZHpkd2l5bmJ6YmNhcW1wcGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNTYxNjUsImV4cCI6MjA5MjczMjE2NX0.OdyGOANMtP1LvL4gkSDbkdXU2BW8LVhN3rbmpJRqlPk';
const REST_PATH = '/rest/v1/';
const ROUNDS_TABLE = 'rounds';
const CONFIG_TABLE = 'app_config';

// ============ HTTP 请求 ============

/**
 * @param {'GET'|'PATCH'|'POST'} method
 * @param {string} table - 表名
 * @param {object|null} queryParams - URL 查询参数对象
 * @param {object|null} body - 请求体
 * @returns {Promise<{status: number, data: any}>}
 */
function request(method, table, queryParams, body) {
  return new Promise((resolve, reject) => {
    let path = REST_PATH + table;
    if (queryParams) {
      const qs = Object.entries(queryParams)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
        .join('&');
      if (qs) path += '?' + qs;
    }

    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Prefer': 'return=minimal'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (err) => reject(new Error('网络错误: ' + err.message)));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('请求超时')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * 带查询条件的 GET 请求（用于过滤条件）
 * @param {string} method
 * @param {string} table
 * @param {string} filterStr - 如 'id=eq.r_xxx'
 * @param {object|null} extraParams - 额外查询参数
 * @param {object|null} body
 * @returns {Promise<{status: number, data: any}>}
 */
function requestWithFilter(method, table, filterStr, extraParams, body) {
  return new Promise((resolve, reject) => {
    let path = REST_PATH + table + '?' + filterStr;
    if (extraParams) {
      const qs = Object.entries(extraParams)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
        .join('&');
      if (qs) path += '&' + qs;
    }

    const options = {
      hostname: new URL(SUPABASE_URL).hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Prefer': method === 'GET' ? '' : 'return=minimal'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (err) => reject(new Error('网络错误: ' + err.message)));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('请求超时')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============ 业务逻辑 ============

async function checkColumnExists() {
  const res = await request('GET', ROUNDS_TABLE, { 'select': 'id,name,is_active', 'limit': '1' });
  if (res.status === 400 && JSON.stringify(res.data).includes('is_active')) {
    return false;
  }
  return res.status === 200;
}

async function getOldActiveRoundId() {
  const res = await request('GET', CONFIG_TABLE, { 'select': 'value', 'key': 'eq.active_round_id', 'limit': '1' });
  if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
    return res.data[0].value || null;
  }
  return null;
}

async function migrateActiveRound(targetRoundId) {
  if (!targetRoundId) {
    console.log('  ℹ 无历史 active_round_id，跳过数据迁移');
    return;
  }

  // 清除所有 is_active
  const res1 = await request('PATCH', ROUNDS_TABLE, null, { is_active: false });
  console.log('  清除所有 is_active:', res1.status < 300 ? '✓' : '✗ ' + res1.status);

  // 设置目标为 true
  const encodedId = encodeURIComponent(String(targetRoundId));
  const res2 = await requestWithFilter('PATCH', ROUNDS_TABLE, 'id=eq.' + encodedId, null, { is_active: true });
  console.log('  设置 id=' + targetRoundId + ' 为 is_active=true:', res2.status < 300 ? '✓' : '✗ ' + res2.status);
}

async function verifyMigration() {
  const res = await request('GET', ROUNDS_TABLE, { 'select': 'id,name,is_active', 'order': 'created_at.asc' });
  if (res.status !== 200) {
    throw new Error('验证查询失败: ' + res.status + ' ' + JSON.stringify(res.data));
  }
  return res.data || [];
}

// ============ 主流程 ============

async function main() {
  console.log('\n=========================================');
  console.log('  绩效考评系统 v1.2.0 数据库迁移脚本');
  console.log('  Supabase: ' + SUPABASE_URL);
  console.log('=========================================\n');

  // 步骤 1: 检查列
  console.log('[步骤 1/4] 检查 is_active 列是否存在...');
  const colExists = await checkColumnExists();
  if (!colExists) {
    console.log('  → 列不存在，请在 Supabase SQL Editor 中执行：');
    console.log('    ALTER TABLE rounds ADD COLUMN is_active BOOLEAN DEFAULT FALSE;');
    console.log('  执行后再重新运行本脚本。\n');
    process.exit(1);
  }
  console.log('  ✓ 列已存在\n');

  // 步骤 2: 读取原 active_round_id
  console.log('[步骤 2/4] 读取原 active_round_id...');
  const oldId = await getOldActiveRoundId();
  if (oldId) {
    console.log('  ✓ active_round_id =', oldId);
  } else {
    console.log('  ℹ 未找到（可能为空，或已迁移）');
  }
  console.log('');

  // 步骤 3: 迁移
  console.log('[步骤 3/4] 执行数据迁移...');
  await migrateActiveRound(oldId);
  console.log('');

  // 步骤 4: 验证
  console.log('[步骤 4/4] 验证迁移结果...');
  const rounds = await verifyMigration();
  if (rounds.length === 0) {
    console.log('  ⚠ 未读取到 rounds 数据（可能为 RLS 限制）');
  } else {
    console.log('');
    rounds.forEach((r) => {
      const marker = r.is_active ? '★' : '  ';
      const name = r.name || '(未命名)';
      console.log('  ' + marker + ' id=' + r.id + '  name="' + name + '"  is_active=' + r.is_active);
    });
  }

  console.log('\n=========================================');
  console.log('  ✓ 完成');
  console.log('=========================================\n');
}

main().catch((err) => {
  console.error('\n✗ 失败:', err.message);
  process.exit(1);
});
