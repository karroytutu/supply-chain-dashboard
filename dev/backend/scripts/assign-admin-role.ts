/**
 * 为用户分配管理员角色
 * 用法: npx ts-node scripts/assign-admin-role.ts
 */
import { appQuery } from '../src/db/appPool';

async function assignAdminRole() {
  try {
    const targetName = '文昌盛';
    console.log(`=== 为 ${targetName} 分配管理员角色 ===\n`);

    // 1. 查找用户
    console.log('1. 查找用户...');
    const userResult = await appQuery(
      'SELECT id, name, dingtalk_user_id FROM users WHERE name = $1',
      [targetName]
    );
    
    if (userResult.rows.length === 0) {
      console.log(`❌ 未找到用户: ${targetName}`);
      return;
    }
    
    const user = userResult.rows[0];
    console.log(`✓ 找到用户: ID=${user.id}, 姓名=${user.name}`);
    
    // 2. 查找管理员角色
    console.log('\n2. 查找管理员角色...');
    const roleResult = await appQuery(
      "SELECT id, code, name FROM roles WHERE code = 'admin'"
    );
    
    if (roleResult.rows.length === 0) {
      console.log('❌ 未找到管理员角色');
      return;
    }
    
    const adminRole = roleResult.rows[0];
    console.log(`✓ 找到管理员角色: ID=${adminRole.id}, 名称=${adminRole.name}`);
    
    // 3. 查看用户当前角色
    console.log('\n3. 用户当前角色...');
    const currentRolesResult = await appQuery(`
      SELECT r.id, r.code, r.name 
      FROM user_roles ur 
      JOIN roles r ON r.id = ur.role_id 
      WHERE ur.user_id = $1
    `, [user.id]);
    
    if (currentRolesResult.rows.length > 0) {
      console.table(currentRolesResult.rows);
    } else {
      console.log('  用户当前无角色');
    }
    
    // 4. 检查是否已有管理员角色
    const hasAdmin = currentRolesResult.rows.some((r: any) => r.code === 'admin');
    if (hasAdmin) {
      console.log('\n✅ 用户已拥有管理员角色，无需重复分配');
      return;
    }
    
    // 5. 分配管理员角色
    console.log('\n4. 分配管理员角色...');
    await appQuery(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [user.id, adminRole.id]
    );
    console.log('✓ 已分配管理员角色');
    
    // 6. 验证结果
    console.log('\n5. 验证分配结果...');
    const verifyResult = await appQuery(`
      SELECT r.id, r.code, r.name 
      FROM user_roles ur 
      JOIN roles r ON r.id = ur.role_id 
      WHERE ur.user_id = $1
    `, [user.id]);
    console.table(verifyResult.rows);
    
    console.log('\n✅ 管理员角色分配成功！');
    
  } catch (error) {
    console.error('❌ 执行失败:', error);
  } finally {
    process.exit(0);
  }
}

assignAdminRole();
