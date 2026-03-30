/**
 * 为管理员角色分配应收账款权限
 */
import { appQuery } from '../src/db/appPool';

async function assignARPermissions() {
  try {
    console.log('=== 开始分配应收账款权限 ===\n');

    // 1. 查看 users 表结构
    console.log('1. users 表结构:');
    const userColumnsResult = await appQuery(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.table(userColumnsResult.rows);
    
    console.log('1.1 现有用户列表:');
    const usersResult = await appQuery('SELECT * FROM users LIMIT 20');
    console.table(usersResult.rows);

    // 2. 查看现有角色
    console.log('\n2. 现有角色列表:');
    const rolesResult = await appQuery('SELECT id, code, name FROM roles');
    console.table(rolesResult.rows);

    // 3. 查看角色-权限关联
    console.log('\n3. 角色-权限关联表结构:');
    try {
      const tableInfo = await appQuery(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'role_permissions'
      `);
      console.table(tableInfo.rows);
    } catch (e) {
      console.log('无法获取表结构:', e);
    }

    // 4. 查看用户-角色关联
    console.log('\n4. 用户-角色关联:');
    const userRolesResult = await appQuery(`
      SELECT ur.user_id, u.name as user_name, ur.role_id, r.code as role_code 
      FROM user_roles ur 
      JOIN users u ON u.id = ur.user_id 
      JOIN roles r ON r.id = ur.role_id
    `);
    console.table(userRolesResult.rows);

    // 5. 查看应收账款相关权限
    console.log('\n5. 应收账款相关权限:');
    const arPermissionsResult = await appQuery(`
      SELECT id, code, name FROM permissions WHERE code LIKE 'finance:ar:%'
    `);
    console.table(arPermissionsResult.rows);

    // 6. 查找管理员角色
    console.log('\n6. 查找管理员角色:');
    const adminRoleResult = await appQuery(`
      SELECT id, code, name FROM roles WHERE code = 'admin' OR code LIKE '%admin%'
    `);
    console.table(adminRoleResult.rows);

    if (adminRoleResult.rows.length === 0) {
      console.log('未找到管理员角色，请检查角色表');
      return;
    }

    const adminRoleId = adminRoleResult.rows[0].id;
    console.log(`使用管理员角色 ID: ${adminRoleId}`);

    // 7. 为管理员角色分配应收账款权限
    console.log('\n7. 分配应收账款权限给管理员角色...');
    
    const arPermissionCodes = ['finance:ar:read', 'finance:ar:collect', 'finance:ar:review', 'finance:ar:penalty', 'finance:ar:manage'];
    
    for (const permCode of arPermissionCodes) {
      // 获取权限ID
      const permResult = await appQuery(
        'SELECT id FROM permissions WHERE code = $1',
        [permCode]
      );
      
      if (permResult.rows.length === 0) {
        console.log(`  - 权限 ${permCode} 不存在，跳过`);
        continue;
      }
      
      const permId = permResult.rows[0].id;
      
      // 插入角色-权限关联
      try {
        await appQuery(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [adminRoleId, permId]
        );
        console.log(`  ✓ 已分配权限: ${permCode}`);
      } catch (e) {
        console.log(`  - 权限 ${permCode} 已存在或分配失败:`, e);
      }
    }

    // 8. 验证权限分配
    console.log('\n8. 验证权限分配结果:');
    const verifyResult = await appQuery(`
      SELECT r.code as role, p.code as permission 
      FROM role_permissions rp 
      JOIN roles r ON r.id = rp.role_id 
      JOIN permissions p ON p.id = rp.permission_id 
      WHERE p.code LIKE 'finance:ar:%'
    `);
    console.table(verifyResult.rows);

    console.log('\n=== 权限分配完成 ===');

  } catch (error) {
    console.error('执行失败:', error);
  } finally {
    process.exit(0);
  }
}

assignARPermissions();
