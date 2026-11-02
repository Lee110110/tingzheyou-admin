import { createRouter, createWebHistory } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

import Layout from '../layout/index.vue';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/login/index.vue'), meta: { public: true } },
  {
    path: '/',
    component: Layout,
    children: [
      { path: 'scenic', name: 'scenic', component: () => import('../views/scenic/AreaList.vue'), meta: { perm: 'scenic', title: '景区管理' } },
      { path: 'scenic/:id/spots', name: 'scenicSpots', component: () => import('../views/scenic/SpotList.vue'), meta: { perm: 'scenic', title: '景点管理' } },
      { path: 'scenic/:id/routes', name: 'scenicRoutes', component: () => import('../views/scenic/RouteList.vue'), meta: { perm: 'scenic', title: '线路管理' } },
      { path: 'product', name: 'product', component: () => import('../views/product/List.vue'), meta: { perm: 'product', title: '商品管理' } },
      { path: 'product/edit/new', name: 'productNew', component: () => import('../views/product/Edit.vue'), meta: { perm: 'product', title: '新建商品' } },
      { path: 'product/edit/:id', name: 'productEdit', component: () => import('../views/product/Edit.vue'), meta: { perm: 'product', title: '编辑商品' } },
      { path: 'pricing', name: 'pricing', component: () => import('../views/pricing/List.vue'), meta: { perm: 'pricing', title: '定价管理' } },
      { path: 'redeem', name: 'redeem', component: () => import('../views/redeem/List.vue'), meta: { perm: 'redeem', title: '兑换码管理' } },
      { path: 'redeem/:id', name: 'redeemDetail', component: () => import('../views/redeem/Detail.vue'), meta: { perm: 'redeem', title: '批次详情' } },
      { path: 'order', name: 'order', component: () => import('../views/order/List.vue'), meta: { perm: 'order', title: '订单管理' } },
      { path: 'order/:id', name: 'orderDetail', component: () => import('../views/order/Detail.vue'), meta: { perm: 'order', title: '订单详情' } },
      { path: 'user', name: 'user', component: () => import('../views/user/List.vue'), meta: { perm: 'user', title: '用户管理' } },
      { path: 'user/:id', name: 'userDetail', component: () => import('../views/user/Detail.vue'), meta: { perm: 'user', title: '用户详情' } },
      { path: 'recommend', name: 'recommend', component: () => import('../views/recommend/List.vue'), meta: { perm: 'recommend', title: '推荐管理' } },
      { path: 'content', name: 'content', component: () => import('../views/content/List.vue'), meta: { perm: 'content', title: '内容位管理' } },
      { path: 'log', name: 'log', component: () => import('../views/log/List.vue'), meta: { perm: 'log', title: '日志管理' } },
      { path: 'system/role', name: 'systemRole', component: () => import('../views/system/Role.vue'), meta: { perm: 'system', title: '角色管理' } },
      { path: 'system/account', name: 'systemAccount', component: () => import('../views/system/Account.vue'), meta: { perm: 'system', title: '成员管理' } },
      { path: ':pathMatch(.*)*', redirect: '/' },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async to => {
  const auth = useAuthStore();
  // 根路径 → 该角色第一个有权限的菜单
  if (to.path === '/') {
    if (!auth.token) return { path: '/login' };
    if (!auth.menus.length) {
      try {
        await auth.fetchProfile();
      } catch (e) {
        auth.logout();
        return { path: '/login' };
      }
    }
    return { path: auth.firstPath };
  }
  if (to.meta.public) return true;
  if (!auth.token) return { path: '/login' };
  // 刷新后恢复菜单/权限
  if (!auth.menus.length) {
    try {
      await auth.fetchProfile();
    } catch (e) {
      auth.logout();
      return { path: '/login' };
    }
  }
  if (to.meta.perm && !auth.permCodes.includes(to.meta.perm)) {
    ElMessage.error('没有访问该页面的权限');
    return { path: auth.firstPath };
  }
  return true;
});

export default router;
