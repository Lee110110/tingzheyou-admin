<template>
  <div class="login-page">
    <el-card class="login-card">
      <div class="title">🎧 听着游管理后台</div>
      <el-form :model="form" @keyup.enter="submit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="账号" size="large">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password>
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="submit">登 录</el-button>
      </el-form>
      <div class="tip">初始账号：admin / Admin@123456</div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const form = reactive({ username: '', password: '' });
const loading = ref(false);

async function submit() {
  if (!form.username || !form.password) return ElMessage.warning('请输入账号和密码');
  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    ElMessage.success('登录成功');
    router.push('/');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1d2535 0%, #3a5a98 100%);
}
.login-card { width: 380px; padding: 8px 12px; }
.title { font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 24px; color: #303133; }
.tip { margin-top: 12px; color: #909399; font-size: 12px; text-align: center; }
</style>
