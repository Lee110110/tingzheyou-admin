import axios from 'axios';
import { ElMessage } from 'element-plus';

const instance = axios.create({
  baseURL: '/api/v1',
  timeout: 60000,
});

instance.interceptors.request.use(config => {
  const token = localStorage.getItem('tzy_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

instance.interceptors.response.use(
  res => {
    // 文件下载（Excel 导出）
    if (res.config.responseType === 'blob') return res;
    const body = res.data;
    if (body && body.code === 0) return body.data;
    const msg = (body && body.msg) || '请求失败';
    ElMessage.error(msg);
    return Promise.reject(new Error(msg));
  },
  err => {
    const status = err.response && err.response.status;
    const msg = (err.response && err.response.data && err.response.data.msg) || err.message || '网络错误';
    if (status === 401) {
      localStorage.removeItem('tzy_token');
      if (location.pathname !== '/login') {
        ElMessage.error('登录已失效，请重新登录');
        location.href = '/login';
      }
    } else {
      ElMessage.error(msg);
    }
    return Promise.reject(err);
  }
);

export function get(url, params) {
  return instance.get(url, { params });
}

export function post(url, data) {
  return instance.post(url, data);
}

export function put(url, data) {
  return instance.put(url, data);
}

export function del(url) {
  return instance.delete(url);
}

// 下载文件（携带当前登录态，导出 Excel 用）
export async function download(url, params) {
  const res = await instance.get(url, { params, responseType: 'blob' });
  const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
  let filename = 'download.xlsx';
  const disp = res.headers['content-disposition'] || '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(disp);
  if (m) filename = decodeURIComponent(m[1]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default instance;
