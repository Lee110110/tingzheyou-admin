import { get, post, put, del, download } from './request';

export const authApi = {
  login: data => post('/auth/login', data),
  profile: () => get('/auth/profile'),
  changePassword: data => put('/auth/password', data),
};

export const regionApi = {
  tree: () => get('/region/tree'),
};

export const uploadApi = {
  image: file => {
    const fd = new FormData();
    fd.append('file', file);
    return post('/upload/image', fd);
  },
  audio: file => {
    const fd = new FormData();
    fd.append('file', file);
    return post('/upload/audio', fd);
  },
};

export const scenicApi = {
  areas: params => get('/scenic/list', params),
  area: id => get(`/scenic/${id}`),
  createArea: data => post('/scenic', data),
  updateArea: (id, data) => put(`/scenic/${id}`, data),
  deleteArea: id => del(`/scenic/${id}`),
  setAreaStatus: (id, status) => put(`/scenic/${id}/status`, { status }),
  spots: areaId => get(`/scenic/${areaId}/spots`),
  createSpot: (areaId, data) => post(`/scenic/${areaId}/spots`, data),
  updateSpot: (spotId, data) => put(`/scenic/spots/${spotId}`, data),
  deleteSpot: spotId => del(`/scenic/spots/${spotId}`),
  setSpotStatus: (spotId, status) => put(`/scenic/spots/${spotId}/status`, { status }),
  searchSpots: keyword => get('/scenic/spots/search', { keyword }),
  routes: areaId => get(`/scenic/${areaId}/routes`),
  createRoute: (areaId, data) => post(`/scenic/${areaId}/routes`, data),
  routeDetail: routeId => get(`/scenic/route/${routeId}`),
  updateRoute: (routeId, data) => put(`/scenic/route/${routeId}`, data),
  removeRoute: routeId => del(`/scenic/route/${routeId}`),
};

export const productApi = {
  list: params => get('/product/list', params),
  all: keyword => get('/product/all', { keyword }),
  detail: id => get(`/product/${id}`),
  create: data => post('/product', data),
  update: (id, data) => put(`/product/${id}`, data),
  remove: id => del(`/product/${id}`),
  setStatus: (id, status) => put(`/product/${id}/status`, { status }),
};

export const pricingApi = {
  list: params => get('/pricing/list', params),
  detail: id => get(`/pricing/${id}`),
  create: data => post('/pricing', data),
  update: (id, data) => put(`/pricing/${id}`, data),
  remove: id => del(`/pricing/${id}`),
  setStatus: (id, status) => put(`/pricing/${id}/status`, { status }),
  resolve: (skuId, channel, audience) => get('/pricing/resolve', { skuId, channel, audience }),
  skuBound: (skuId, excludePlanId) => get('/pricing/sku-bound', { skuId, excludePlanId }),
};

export const redeemApi = {
  list: params => get('/redeem/list', params),
  detail: id => get(`/redeem/${id}`),
  create: data => post('/redeem', data),
  void: id => put(`/redeem/${id}/void`),
  codes: (id, params) => get(`/redeem/${id}/codes`, params),
  exportCodes: id => download(`/redeem/${id}/export`),
};

export const orderApi = {
  list: params => get('/order/list', params),
  detail: id => get(`/order/${id}`),
  cancel: (id, reason) => post(`/order/${id}/cancel`, { reason }),
  refund: (id, amount, reason) => post(`/order/${id}/refund`, { amount, reason }),
  export: params => download('/order/export', params),
};

export const userApi = {
  list: params => get('/user/list', params),
  detail: id => get(`/user/${id}`),
  orders: (id, params) => get(`/user/${id}/orders`, params),
  redeems: (id, params) => get(`/user/${id}/redeems`, params),
};

export const recommendApi = {
  list: params => get('/recommend/list', params),
  create: data => post('/recommend', data),
  update: (id, data) => put(`/recommend/${id}`, data),
  remove: id => del(`/recommend/${id}`),
};

export const contentApi = {
  list: params => get('/content/list', params),
  create: data => post('/content', data),
  update: (id, data) => put(`/content/${id}`, data),
  remove: id => del(`/content/${id}`),
};

export const logApi = {
  list: params => get('/log/list', params),
};

export const systemApi = {
  roles: params => get('/system/roles', params),
  createRole: data => post('/system/roles', data),
  updateRole: (id, data) => put(`/system/roles/${id}`, data),
  deleteRole: id => del(`/system/roles/${id}`),
  roleMenus: id => get(`/system/roles/${id}/menus`),
  setRoleMenus: (id, menuIds) => put(`/system/roles/${id}/menus`, { menuIds }),
  menuTree: () => get('/system/menus'),
  accounts: params => get('/system/accounts', params),
  createAccount: data => post('/system/accounts', data),
  updateAccount: (id, data) => put(`/system/accounts/${id}`, data),
  setAccountStatus: (id, status) => put(`/system/accounts/${id}/status`, { status }),
  resetAccountPassword: (id, password) => put(`/system/accounts/${id}/reset-password`, { password }),
  deleteAccount: id => del(`/system/accounts/${id}`),
};
