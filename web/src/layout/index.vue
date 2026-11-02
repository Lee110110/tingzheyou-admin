<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">🎧 听着游后台</div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#1d2535"
        text-color="#a3adc2"
        active-text-color="#ffffff"
      >
        <template v-for="item in menus" :key="item.id">
          <el-sub-menu v-if="item.children && item.children.length" :index="String(item.id)">
            <template #title>
              <el-icon><component :is="item.icon || 'Menu'" /></el-icon>
              <span>{{ item.title }}</span>
            </template>
            <el-menu-item v-for="child in item.children" :key="child.id" :index="child.path">
              {{ child.title }}
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.path">
            <el-icon><component :is="item.icon || 'Menu'" /></el-icon>
            <span>{{ item.title }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="crumb">{{ route.meta.title || '' }}</div>
        <el-dropdown @command="onCommand">
          <span class="user">
            <el-icon><UserFilled /></el-icon>
            {{ admin?.realName || admin?.username || '-' }}
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="password">修改密码</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>

    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form label-width="90px">
        <el-form-item label="原密码" required>
          <el-input v-model="pwdForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="确认新密码" required>
          <el-input v-model="pwdForm.confirm" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePassword">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { authApi } from '../api';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const menus = computed(() => auth.menus);
const admin = computed(() => auth.admin);
const activeMenu = computed(() => {
  // 详情页高亮对应列表菜单
  if (route.path.startsWith('/scenic/')) return '/scenic';
  if (route.path.startsWith('/product/')) return '/product';
  if (route.path.startsWith('/redeem/')) return '/redeem';
  if (route.path.startsWith('/order/')) return '/order';
  if (route.path.startsWith('/user/')) return '/user';
  return route.path;
});

const pwdVisible = ref(false);
const saving = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });

function onCommand(cmd) {
  if (cmd === 'password') {
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirm = '';
    pwdVisible.value = true;
  } else if (cmd === 'logout') {
    ElMessageBox.confirm('确定退出登录吗？', '提示', { type: 'warning' }).then(() => {
      auth.logout();
      router.push('/login');
    }).catch(() => {});
  }
}

async function savePassword() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) return ElMessage.warning('请填写完整');
  if (pwdForm.newPassword.length < 6) return ElMessage.warning('新密码至少 6 位');
  if (pwdForm.newPassword !== pwdForm.confirm) return ElMessage.warning('两次输入的新密码不一致');
  saving.value = true;
  try {
    await authApi.changePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
    ElMessage.success('密码已修改，请重新登录');
    pwdVisible.value = false;
    auth.logout();
    router.push('/login');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.layout { height: 100vh; }
.aside { background: #1d2535; overflow-y: auto; }
.aside::-webkit-scrollbar { width: 0; }
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 1px;
}
.aside :deep(.el-menu) { border-right: none; }
.header {
  background: #fff;
  border-bottom: 1px solid #e8eaf0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.crumb { font-size: 15px; font-weight: 600; color: #303133; }
.user {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #303133;
  font-size: 14px;
  outline: none;
}
.main { padding: 16px; overflow-y: auto; }
</style>
