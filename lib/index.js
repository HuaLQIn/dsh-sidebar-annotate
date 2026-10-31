// dsh-sidebar-annotate 的 Node half：功能全在浏览器 bundle（lib/client.js），
// Node 侧只留一个空插件，让 Loader 有条目、client-modules 能扫到 dsh.client 声明。
export const name = 'dsh-sidebar-annotate';
export function apply() {}
export default { name, apply };
