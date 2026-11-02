// 行政区划树与 code→名称 映射（模块级缓存，全站共用）
import { regionApi } from '../api';

let treeCache = null;
let nameMapCache = null;

export async function getRegionTree() {
  if (!treeCache) treeCache = await regionApi.tree();
  if (!nameMapCache) {
    nameMapCache = {};
    treeCache.forEach(p => {
      nameMapCache[p.code] = p.name;
      p.children.forEach(c => { nameMapCache[c.code] = c.name; });
    });
  }
  return treeCache;
}

export async function getRegionNames() {
  await getRegionTree();
  return nameMapCache;
}
