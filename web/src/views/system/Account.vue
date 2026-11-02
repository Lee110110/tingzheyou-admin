<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="账号 / 姓名" clearable @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="keyword = ''; search()">重置</el-button>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog">新增成员</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="username" label="登录账号" min-width="130" />
        <el-table-column prop="real_name" label="姓名" min-width="110" />
        <el-table-column prop="role_name" label="角色" width="130" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-switch
              :model-value="row.status === 1"
              :disabled="row.id === auth.admin?.id"
              @change="v => toggleStatus(row, v)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="last_login_at" label="最近登录" width="160">
          <template #default="{ row }">{{ row.last_login_at || '从未登录' }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="warning" @click="openResetPwd(row)">重置密码</el-button>
            <el-button link type="danger" :disabled="row.id === auth.admin?.id" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="load"
        />
      </div>
    </el-card>

    <!-- 新增 / 编辑成员 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑成员' : '新增成员'" width="480px">
      <el-form label-width="90px">
        <el-form-item label="登录账号" required>
          <el-input v-model="form.username" placeholder="3-50 位字母、数字或下划线" :disabled="!!form.id" />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.roleId" style="width: 100%" placeholder="选择角色">
            <el-option v-for="r in roleOptions" :key="r.id" :value="r.id" :label="r.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!form.id" label="初始密码" required>
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="pwdVisible" :title="`重置密码：${pwdTarget?.username || ''}`" width="420px">
      <el-form label-width="90px">
        <el-form-item label="新密码" required>
          <el-input v-model="newPassword" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSaving" @click="doResetPwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { systemApi } from '../../api';
import { useAuthStore } from '../../stores/auth';
import { PAGE_SIZE } from '../../constants';

const auth = useAuthStore();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const keyword = ref('');
const roleOptions = ref([]);

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({ id: null, username: '', realName: '', roleId: '', password: '' });

const pwdVisible = ref(false);
const pwdSaving = ref(false);
const pwdTarget = ref(null);
const newPassword = ref('');

onMounted(async () => {
  load();
  const data = await systemApi.roles({ page: 1, pageSize: 100 });
  roleOptions.value = data.list;
});

async function load() {
  loading.value = true;
  try {
    const data = await systemApi.accounts({ page: page.value, pageSize: PAGE_SIZE, keyword: keyword.value || '' });
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function openDialog(row) {
  form.id = row ? row.id : null;
  form.username = row ? row.username : '';
  form.realName = row ? row.real_name : '';
  form.roleId = row ? row.role_id : '';
  form.password = '';
  dialogVisible.value = true;
}

async function save() {
  if (!form.username) return ElMessage.warning('请输入登录账号');
  if (!form.realName) return ElMessage.warning('请输入姓名');
  if (!form.roleId) return ElMessage.warning('请选择角色');
  if (!form.id && (!form.password || form.password.length < 6)) return ElMessage.warning('初始密码至少 6 位');
  saving.value = true;
  try {
    if (form.id) {
      await systemApi.updateAccount(form.id, { username: form.username, realName: form.realName, roleId: form.roleId });
      ElMessage.success('已保存');
    } else {
      await systemApi.createAccount({
        username: form.username, realName: form.realName, roleId: form.roleId, password: form.password,
      });
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row, val) {
  await systemApi.setAccountStatus(row.id, val ? 1 : 0);
  ElMessage.success(val ? '已启用' : '已禁用');
  load();
}

function openResetPwd(row) {
  pwdTarget.value = row;
  newPassword.value = '';
  pwdVisible.value = true;
}

async function doResetPwd() {
  if (!newPassword.value || newPassword.value.length < 6) return ElMessage.warning('新密码至少 6 位');
  pwdSaving.value = true;
  try {
    await systemApi.resetAccountPassword(pwdTarget.value.id, newPassword.value);
    ElMessage.success('密码已重置');
    pwdVisible.value = false;
  } finally {
    pwdSaving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除成员「${row.username}」？`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await systemApi.deleteAccount(row.id);
  ElMessage.success('已删除');
  if (list.value.length === 1 && page.value > 1) page.value -= 1;
  load();
}
</script>
