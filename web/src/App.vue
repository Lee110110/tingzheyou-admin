<template>
  <router-view />
</template>

<style>
* { box-sizing: border-box; }
html, body, #app { height: 0; margin: 0; }
body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
  background: #f5f7fa;
}
.page-card { margin-bottom: 16px; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.filter-bar .el-input, .filter-bar .el-select { width: 200px; }
.table-card .el-table { width: 100%; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
.money { color: #f56c6c; font-weight: 600; }
.dim { color: #909399; font-size: 12px; }
</style>
