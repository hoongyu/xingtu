/* 生辰记在这台设备上。
 *
 * 为什么要：星盘和紫微各有一张一模一样的生辰表，切过去就得重填一遍；
 * 在星盘上点一圈再回来，填过的也没了。反馈说的就是这个。
 *
 * 为什么只到 localStorage 为止：这个站从第一天起就是「生辰不出这台机器」——
 * 不调地理编码、不发服务器、没有账号。记忆也照这条办：
 * 存在本机，页面上摆一个「忘 掉」，一按就没。
 * 存的东西也说清楚：年月日、时分、出生地在表里的下标、夏令时、乾坤。
 * 没有姓名，没有任何能指向具体某个人的东西。
 *
 * 两页各写各懂的那几项，写的时候跟已有的合并 ——
 * 星盘不该把紫微填的乾坤抹掉，紫微也不该抹掉星盘填的出生地。
 */
const KEY = 'xingtu-birth';

export function load(){
  try {
    const t = localStorage.getItem(KEY);
    if (!t) return null;
    const o = JSON.parse(t);
    // 存过的东西未必还合法（改过版本、手动动过）。逐项校验，坏的就当没有。
    if (!Number.isInteger(o.y) || o.y < 1 || o.y > 3000) return null;
    if (!Number.isInteger(o.m) || o.m < 1 || o.m > 12) return null;
    if (!Number.isInteger(o.d) || o.d < 1 || o.d > 31) return null;
    return o;
  } catch (_){ return null; }        // 隐私模式下 localStorage 会抛
}

export function save(patch){
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...(load() || {}), ...patch }));
  } catch (_){}
}

export function forget(){
  try { localStorage.removeItem(KEY); } catch (_){}
}

/** 日期戳旁边那个「忘 掉」。存着东西才出现，按下就清掉并刷新。
 *  放在日期戳旁边是有意的：那里正是「它怎么知道我上次填的」最先被问到的地方。 */
export function forgetBtn(host){
  if (!host) return;
  let b = host.parentNode.querySelector('.forget');
  if (!load()){ if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('button');
  b.type = 'button'; b.className = 'forget';
  b.textContent = '忘 掉';
  b.title = '生辰只存在这台设备上，按一下就清掉';
  b.addEventListener('click', () => { forget(); location.reload(); });
  host.parentNode.insertBefore(b, host.nextSibling);
}
