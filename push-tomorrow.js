// 读取工作台数据(Gist)，推送待办到微信(Server酱)
// 用法：node push-tomorrow.js [tomorrow|today]   默认 tomorrow（今晚23点推明天）
const GIST_DESC = '工作台数据';
const GIST_FILE = 'workbench.json';
const API = 'https://api.github.com';

async function main() {
  const target = process.argv[2] === 'today' ? 'today' : 'tomorrow';
  const pat = process.env.GIST_PAT;
  const sendkey = process.env.SENDKEY;
  if (!pat) throw new Error('缺少环境变量 GIST_PAT（仓库 secrets 没配）');
  if (!sendkey) throw new Error('缺少环境变量 SENDKEY（仓库 secrets 没配）');

  const headers = {
    'Authorization': 'Bearer ' + pat,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  // 1. 找到工作台的 Gist
  const listRes = await fetch(API + '/gists?per_page=100', { headers });
  if (!listRes.ok) throw new Error('读取 Gist 列表失败: ' + listRes.status + '（GIST_PAT 令牌可能失效/没勾 Gist 权限）');
  const list = await listRes.json();
  const gist = list.find(g => g.description === GIST_DESC);
  if (!gist) throw new Error('没找到「' + GIST_DESC + '」Gist，请先在工作台网页里点一次「同步」');

  // 2. 读取数据
  const gRes = await fetch(API + '/gists/' + gist.id, { headers });
  if (!gRes.ok) throw new Error('读取 Gist 失败: ' + gRes.status);
  const g = await gRes.json();
  const f = g.files && g.files[GIST_FILE];
  let tasks = [];
  if (f) {
    try { const o = JSON.parse(f.content || '{}'); tasks = Array.isArray(o.tasks) ? o.tasks : []; } catch (e) {}
  }

  // 3. 算北京时间的目标日期（today=当天，tomorrow=明天）
  const CST = 8 * 3600 * 1000;
  const now = new Date(Date.now() + CST);
  const offset = target === 'today' ? 0 : 1;
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  const key = day.getUTCFullYear() + '-' + String(day.getUTCMonth() + 1).padStart(2, '0') + '-' + String(day.getUTCDate()).padStart(2, '0');
  const wd = '日一二三四五六'[day.getUTCDay()];
  const md = (day.getUTCMonth() + 1) + '月' + day.getUTCDate() + '日';
  const label = target === 'today' ? '今天' : '明天';

  // 4. 过滤目标日期的任务 + 待排期
  const tom = tasks.filter(t => t.date === key).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const pool = tasks.filter(t => t.date === '');

  // 5. 组装消息
  const lines = [];
  lines.push('📅 ' + label + ' ' + md + ' 星期' + wd + ' 待办');
  if (!tom.length) lines.push('（暂无安排）');
  for (const t of tom) {
    let line = (t.time || '待定') + '  ' + t.title;
    if (t.dur) line += '（' + t.dur + '）';
    if (t.progress && t.progress !== '100') line += ' · 完成' + t.progress + '%';
    lines.push(line);
    if (t.subs && t.subs.length) {
      for (const s of t.subs) lines.push('　　· ' + (s.done ? '☑ ' : '☐ ') + s.t);
    }
  }
  if (pool.length) {
    lines.push('');
    lines.push('⚠ 待排期 ' + pool.length + ' 条：' + pool.map(t => t.title).join('、'));
  }

  const title = label + '待办 · ' + md;
  const desp = lines.join('\n');

  // 6. 推送到 Server酱
  const res = await fetch('https://sctapi.ftqq.com/' + sendkey + '.send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ title, desp })
  });
  const out = await res.json();
  console.log('Server酱返回:', JSON.stringify(out));
  if (out.code !== 0) throw new Error('推送失败：Server酱返回 code=' + out.code + '（SENDKEY 可能失效，或当日发送次数用尽）');
  console.log('推送成功：' + title);
}

main().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
