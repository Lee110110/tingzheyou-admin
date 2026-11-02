<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="角色名称" clearable @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="keyword = ''; search()">重置</el-button>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog">新增角色</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="角色名称" min-width="140" />
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column prop="member_count" label="成员数" width="90" />
        <el-table-column prop="menu_count" label="已授权菜单数" width="110" />
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openPermDialog(row)">配置权限</el-button>
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" :disabled="row.member_count > 0" @click="remove(row)">删除</el-button>
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

    <!-- 新增 / 编辑角色 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑角色' : '新增角色'" width="460px">
      <el-form label-width="80px">
        <el-form-item label="角色名称" required>
          <el-input v-model="form.name" placeholder="如：运营专员" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 配置权限 -->
    <el-dialog v-model="permVisible" :title="`配置权限：${permRole?.name || ''}`" width="480px">
      <el-tree
        ref="treeRef"
        :data="menuTree"
        node-key="id"
        show-checkbox
        default-expand-all
        :props="{ children: 'children', label: 'label' }"
      />
      <div class="dim" style="margin-top: 8px">权限粒度为菜单级：勾选某菜单即拥有该菜单全部操作权限</div>
      <template #footer>
        <el-button @click="permVisible = false">取消</el-button>
        <el-button type="primary" :loading="permSaving" @click="savePerm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { systemApi } from '../../api';
import { PAGE_SIZE } from '../../constants';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const keyword = ref('');

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({ id: null, name: '', remark: '' });

const permVisible = ref(false);
const permSaving = ref(false);
const permRole = ref(null);
const menuTree = ref([]);
const treeRef = ref(null);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await systemApi.roles({ page: page.value, pageSize: PAGE_SIZE, keyword: keyword.value || '' });
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
  form.name = row ? row.name : '';
  form.remark = row ? row.remark : '';
  dialogVisible.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入角色名称');
  saving.value = true;
  try {
    if (form.id) {
      await systemApi.updateRole(form.id, { name: form.name, remark: form.remark });
      ElMessage.success('已保存');
    } else {
      await systemApi.createRole({ name: form.name, remark: form.remark });
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除角色「${row.name}」？仍有成员的角色无法删除。`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await systemApi.deleteRole(row.id);
  ElMessage.success('已删除');
  if (list.value.length === 1 && page.value > 1) page.value -= 1;
  load();
}

async function openPermDialog(row) {
  permRole.value = row;
  permVisible.value = true;
  if (!menuTree.value.length) menuTree.value = await systemApi.menuTree();
  const menuIds = await systemApi.roleMenus(row.id);
  // 只回显叶子节点，父级由勾选状态自动推导（避免“勾父全选子”的误展示）
  const parentIds = new Set(menuTree.value.map(m => m.id));
  const leafIds = menuIds.filter(id => !parentIds.has(id));
  await nextTick();
  treeRef.value.setCheckedKeys(leafIds, true);
}

async function savePerm() {
  const checked = treeRef.value.getCheckedKeys();
  const half = treeRef.value.getHalfCheckedKeys();
  const menuIds = [...checked, ...half];
  permSaving.value = true;
  try {
    await systemApi.setRoleMenus(permRole.value.id, menuIds);
    ElMessage.success('权限已保存');
    permVisible.value = false;
    load();
  } finally {
    permSaving.value = false;
  }
}
</script>
