import { defineStore } from 'pinia';
import { authApi } from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('tzy_token') || '',
    admin: null,
    menus: [],
    permCodes: [],
  }),
  getters: {
    firstPath(state) {
      for (const m of state.menus) {
        if (m.path) return m.path;
        if (m.children && m.children.length && m.children[0].path) return m.children[0].path;
      }
      return '/login';
    },
  },
  actions: {
    async login(username, password) {
      const data = await authApi.login({ username, password });
      this.token = data.token;
      this.admin = data.admin;
      localStorage.setItem('tzy_token', data.token);
    },
    async fetchProfile() {
      const data = await authApi.profile();
      this.admin = data.admin;
      this.menus = data.menus;
      this.permCodes = data.permCodes;
    },
    logout() {
      this.token = '';
      this.admin = null;
      this.menus = [];
      this.permCodes = [];
      localStorage.removeItem('tzy_token');
    },
  },
});
