const { query } = require('../config/db');

/**
 * 统一操作日志。
 * record({ req, module, action, target, before, after })
 * - req: 有请求上下文时传（记录当前操作人与 IP）；种子/定时任务里可不传，记为 system
 */
async function record({ req = null, module, action, target = '', before = null, after = null }) {
  try {
    let adminUserId = null;
    let username = 'system';
    let ip = '';
    if (req && req.adminUser) {
      adminUserId = req.adminUser.id;
      username = req.adminUser.username;
    }
    if (req) {
      ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
    }
    await query(
      'INSERT INTO op_log (admin_user_id, username, module, action, target, before_json, after_json, ip) VALUES (?,?,?,?,?,?,?,?)',
      [adminUserId, username, module, action, String(target).slice(0, 200), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, ip]
    );
  } catch (e) {
    // 日志失败不阻断业务
    console.error('[opLog]', e.message);
  }
}

module.exports = { record };
